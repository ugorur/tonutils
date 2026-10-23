// Recipient lists for the bulk senders: CSV/paste parsing, per-row checks against tonapi account info,
// and totals. Pure TS (imports @ton/core): Tool.vue / logic.ts / vitest only.
import type { Address } from '@ton/core'
import type { Note, Purpose, TonapiAccount } from '~/lib/wallet-actions/core'
import { chooseBounce, parseRecipient, recipientNotes } from '~/lib/wallet-actions/core'
import { parseUnits } from '~/utils/units'

export type Separator = ',' | ';' | '\t'

export interface ParsedRow {
  /** 1-based line in the input. */
  line: number
  /** Address text as typed. */
  input: string
  address: Address | null
  /** Bounce flag the user typed (EQ true, UQ false, raw null). */
  typedBounceable: boolean | null
  typedTestOnly: boolean | null
  /** Base units (nanoGRAM or jetton units). */
  amount: bigint | null
  comment: string
  /** Why this row cannot be sent (parse level). */
  error: string | null
}

export interface CheckedRow extends ParsedRow {
  account: TonapiAccount | null
  /** Friendly destination with the bounce flag chosen (GRAM transfers), null until the account is known. */
  destination: string | null
  bounceable: boolean
  notes: Note[]
  /** Parse error, error-level note, or account not checked yet. */
  blocked: boolean
}

/** Tab if any line has one; else whichever of ',' and ';' comes first on the first data line (right after the address). */
export function detectSeparator(text: string): Separator {
  if (text.includes('\t')) return '\t'
  const first = text.split(/\r?\n/).find(l => l.trim() && !l.trim().startsWith('#')) ?? ''
  const m = /[,;]/.exec(first)
  return m?.[0] === ';' ? ';' : ','
}

const unquote = (s: string) => (/^".*"$/s.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s)

/**
 * One CSV line into cells. Double quotes group a cell ("a, b") and "" is a literal quote.
 * With `limit`, the last cell takes the rest of the line as typed (an unquoted comment may contain the separator).
 */
export function splitLine(line: string, sep: Separator, limit = Infinity): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (!quoted && out.length === limit - 1) return [...out, unquote(line.slice(i).trim())]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      }
      else if (ch === '"') quoted = false
      else cur += ch
    }
    else if (ch === '"' && !cur.trim()) {
      quoted = true
      cur = ''
    }
    else if (ch === sep) {
      out.push(cur.trim())
      cur = ''
    }
    else cur += ch
  }
  out.push(quoted ? cur : cur.trim())
  return out
}

function parseAmount(text: string, decimals: number, sep: Separator): bigint {
  let s = text.trim()
  // ';' and tab files usually come from spreadsheets with a decimal comma: "0,5" means 0.5.
  if (sep !== ',' && /^\d+,\d+$/.test(s)) s = s.replace(',', '.')
  const v = parseUnits(s, decimals)
  if (v <= 0n) throw new Error('Amount must be greater than 0')
  return v
}

/**
 * `address, amount, comment` per line (amount and comment optional). Blank lines, `#` lines and a header
 * line are skipped. Separators: comma, semicolon or tab; quote a comment that contains the separator.
 * A row without an amount uses `defaultAmount`. Everything after the second separator is the comment.
 */
export function parseRecipientsCsv(text: string, opts: { decimals: number, defaultAmount?: bigint | null }): ParsedRow[] {
  const sep = detectSeparator(text)
  const rows: ParsedRow[] = []
  let seenData = false
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim()
    if (!t || t.startsWith('#')) return
    const [input = '', amountText = '', comment = ''] = splitLine(t, sep, 3)
    const parsed = parseRecipient(input)
    if (!seenData && parsed.kind === 'invalid' && !/\d/.test(amountText)) return // header line
    seenData = true
    const row: ParsedRow = { line: i + 1, input, address: null, typedBounceable: null, typedTestOnly: null, amount: null, comment, error: null }
    if (parsed.kind === 'address') {
      row.address = parsed.address
      row.typedBounceable = parsed.bounceable
      row.typedTestOnly = parsed.testOnly
    }
    else if (parsed.kind === 'domain') row.error = `${parsed.domain}: names are not resolved in bulk mode. Paste the wallet address instead.`
    else if (parsed.kind === 'empty') row.error = 'Missing address'
    else row.error = `"${input}" is not a TON address`
    try {
      if (amountText.trim()) row.amount = parseAmount(amountText, opts.decimals, sep)
      else if (opts.defaultAmount && opts.defaultAmount > 0n) row.amount = opts.defaultAmount
      else throw new Error('Missing amount (or set a default amount)')
    }
    catch (e) {
      row.error ??= `${(e as Error).message}: "${amountText}"`
    }
    rows.push(row)
  })
  return rows
}

/**
 * Applies account info (tonapi /accounts/_bulk, keyed by lowercase raw address) to each row: bounce flag for
 * GRAM transfers, the same recipient checks as the single-send tools, and duplicates. Rows whose account is
 * not in the map yet, and memo-required accounts without a comment, stay blocked.
 */
export function checkRows(rows: ParsedRow[], accounts: ReadonlyMap<string, TonapiAccount>, ctx: { purpose: Purpose, testnet: boolean, self?: Address | null }): CheckedRow[] {
  const firstLine = new Map<string, number>()
  return rows.map((r) => {
    const base: CheckedRow = { ...r, account: null, destination: null, bounceable: false, notes: [], blocked: true }
    if (!r.address) return base
    const raw = r.address.toRawString()
    const account = accounts.get(raw) ?? null
    const { bounceable, autofixed } = ctx.purpose === 'coin' && account ? chooseBounce(r.typedBounceable, account.status) : { bounceable: false, autofixed: false }
    const notes = recipientNotes(r.address, account, { purpose: ctx.purpose, comment: r.comment, testnet: ctx.testnet, typedTestOnly: r.typedTestOnly, self: ctx.self, autofixed })
    const dup = firstLine.get(raw)
    if (dup) notes.push({ level: 'warning', text: `Same address as line ${dup}: it will be paid twice.` })
    else firstLine.set(raw, r.line)
    return {
      ...base,
      account,
      destination: account ? r.address.toString({ bounceable, testOnly: ctx.testnet, urlSafe: true }) : null,
      bounceable,
      notes,
      // A memo-required exchange without a comment blocks the row: in a bulk run there is no per-row confirmation.
      blocked: !!r.error || !account || notes.some(n => n.level === 'error') || (!!account.memo_required && !r.comment.trim())
    }
  })
}

export interface Totals {
  rows: number
  ready: number
  blocked: number
  /** Sum over all rows with an amount (what the list asks to send). */
  amount: bigint
}

export function totals(rows: CheckedRow[]): Totals {
  const ready = rows.filter(r => !r.blocked).length
  return { rows: rows.length, ready, blocked: rows.length - ready, amount: rows.reduce((s, r) => s + (r.amount ?? 0n), 0n) }
}

/** Lowercase raw addresses still missing from `known`, deduplicated. */
export function missingAccounts(rows: ParsedRow[], known: ReadonlyMap<string, unknown>): string[] {
  return [...new Set(rows.flatMap(r => (r.address ? [r.address.toRawString()] : [])))].filter(a => !known.has(a))
}
