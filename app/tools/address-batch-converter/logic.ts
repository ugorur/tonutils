import { Address } from '@ton/core'

export interface BatchRow {
  /** 1-based line number in the pasted text. */
  line: number
  /** The original line, trimmed. */
  input: string
  /** The token that was read as an address ('' when none was found). */
  token: string
  status: 'ok' | 'invalid' | 'duplicate'
  /** Why a line is invalid, or which line it duplicates. */
  note: string
  /** Set for ok and duplicate rows. */
  raw?: string
  workchain?: number
  bounceable?: string
  nonBounceable?: string
  testnetBounceable?: string
  testnetNonBounceable?: string
  /** The address was written in a testnet-only form (kQ / 0Q). */
  testOnly?: boolean
}

export interface BatchResult {
  rows: BatchRow[]
  valid: number
  invalid: number
  duplicates: number
  /** Valid rows on the masterchain (-1): unusual for an airdrop list. */
  masterchain: number
  /** Valid rows written in testnet-only form. */
  testOnly: number
}

const MAX_LINES = 20000

function parseToken(token: string): { address: Address, testOnly: boolean } | null {
  let p: { address: Address, testOnly: boolean } | null = null
  try {
    if (Address.isRaw(token)) p = { address: Address.parseRaw(token), testOnly: false }
    else if (Address.isFriendly(token)) {
      const f = Address.parseFriendly(token)
      p = { address: f.address, testOnly: f.isTestOnly }
    }
  }
  catch { /* not an address */ }
  // Only the basechain (0) and masterchain (-1) exist; any other workchain is a typo, not an account.
  return p && (p.address.workChain === 0 || p.address.workChain === -1) ? p : null
}

/**
 * One row per non-empty line. A line may be a bare address or a CSV/TSV row: the first
 * field that is a valid TON address is used, so "address,amount" lists work as-is.
 */
export function convertBatch(text: string): BatchResult {
  const lines = text.split(/\r?\n/)
  if (lines.length > MAX_LINES) throw new Error(`Too many lines (${lines.length}). The limit is ${MAX_LINES}.`)

  const seen = new Map<string, number>()
  const rows: BatchRow[] = []
  lines.forEach((l, i) => {
    const input = l.trim()
    if (!input) return
    const tokens = input.split(/[\s,;|]+/).map(t => t.replace(/^["']|["']$/g, '')).filter(Boolean)
    let hit: { token: string, address: Address, testOnly: boolean } | null = null
    for (const token of tokens) {
      const p = parseToken(token)
      if (p) {
        hit = { token, ...p }
        break
      }
    }
    if (!hit) {
      // A 48-character token that failed is almost always a typo or a broken checksum.
      const near = tokens.find(t => /^[A-Za-z0-9+/_-]{48}$/.test(t) || /^-?\d+:[0-9a-fA-F]+$/.test(t))
      // A first line of plain words is a CSV header ("address,amount"): skip it. Anything else
      // (a truncated address, a link) is reported, never dropped silently.
      if (!near && !rows.length && !seen.size && tokens.every(t => /^[A-Za-z_]+$/.test(t))) return
      rows.push({ line: i + 1, input, token: near ?? '', status: 'invalid', note: near ? 'Checksum or format error' : 'No TON address found' })
      return
    }
    const a = hit.address
    const raw = a.toRawString()
    const first = seen.get(raw)
    if (first === undefined) seen.set(raw, i + 1)
    rows.push({
      line: i + 1,
      input,
      token: hit.token,
      status: first === undefined ? 'ok' : 'duplicate',
      note: first === undefined ? '' : `Same account as line ${first}`,
      raw,
      workchain: a.workChain,
      bounceable: a.toString({ bounceable: true, urlSafe: true }),
      nonBounceable: a.toString({ bounceable: false, urlSafe: true }),
      testnetBounceable: a.toString({ bounceable: true, testOnly: true, urlSafe: true }),
      testnetNonBounceable: a.toString({ bounceable: false, testOnly: true, urlSafe: true }),
      testOnly: hit.testOnly
    })
  })

  const unique = rows.filter(r => r.status === 'ok')
  return {
    rows,
    valid: unique.length,
    invalid: rows.filter(r => r.status === 'invalid').length,
    duplicates: rows.filter(r => r.status === 'duplicate').length,
    masterchain: unique.filter(r => r.workchain === -1).length,
    testOnly: unique.filter(r => r.testOnly).length
  }
}

export type OutputFormat = 'nonBounceable' | 'bounceable' | 'raw' | 'testnetNonBounceable' | 'testnetBounceable'

export const OUTPUT_FORMATS: { value: OutputFormat, label: string }[] = [
  { value: 'nonBounceable', label: 'Non-bounceable (UQ…), wallets' },
  { value: 'bounceable', label: 'Bounceable (EQ…), contracts' },
  { value: 'raw', label: 'Raw (0:…)' },
  { value: 'testnetNonBounceable', label: 'Testnet non-bounceable (0Q…)' },
  { value: 'testnetBounceable', label: 'Testnet bounceable (kQ…)' }
]

/** CSV rows with every form, for the export button. */
export function csvRows(rows: BatchRow[]): Record<string, string | number>[] {
  return rows.map(r => ({
    line: r.line,
    input: r.input,
    status: r.status,
    note: r.note,
    raw: r.raw ?? '',
    non_bounceable: r.nonBounceable ?? '',
    bounceable: r.bounceable ?? '',
    testnet_non_bounceable: r.testnetNonBounceable ?? '',
    testnet_bounceable: r.testnetBounceable ?? ''
  }))
}

/** The converted list as plain text, one address per line (valid, deduplicated rows only). */
export function convertedList(rows: BatchRow[], format: OutputFormat): string {
  return rows.filter(r => r.status === 'ok').map(r => r[format]).join('\n')
}
