import { Address } from '@ton/core'
import type { V3Fetch } from '~/utils/api-client'
import type { V3Transaction } from '~/lib/accounts-history/transactions'
import { fetchTransactions, txBalanceDelta, txFees } from '~/lib/accounts-history/transactions'
import { formatCoin, COIN_SYMBOL } from '~/utils/currency'
import { jettonDecimals, KNOWN_JETTONS } from '~/utils/ton/jetton'

// ---------------------------------------------------------------- toncenter v3 /actions shapes (fields we read)

export interface V3Action {
  action_id: string
  type: string
  success: boolean
  start_utime: number
  details: Record<string, unknown>
}

interface TokenInfo { type: string, name: string | null, symbol: string | null, is_scam: boolean | null, extra?: { decimals?: string | null } }
export type V3Metadata = Record<string, { token_info?: TokenInfo[] }>
export type V3AddressBook = Record<string, { user_friendly: string, domain: string | null }>

export interface ActivityData {
  actions: V3Action[]
  transactions: V3Transaction[]
  metadata: V3Metadata
  addressBook: V3AddressBook
  truncated: boolean
}

// ---------------------------------------------------------------- aggregation

export interface TokenStat {
  /** Jetton master, raw upper-case. */
  master: string
  symbol: string
  decimals: number
  /** Transfers out + swaps the wallet started with this token. */
  uses: number
  sent: bigint
  received: bigint
}

export interface CounterpartyStat {
  /** Raw upper-case. */
  address: string
  friendly: string
  /** .ton / .t.me domain from the toncenter address book, if any. */
  domain: string | null
  count: number
  gramIn: bigint
  gramOut: bigint
}

export interface Wrapped {
  address: string
  domain: string | null
  from: number
  to: number
  actions: number
  transactions: number
  gramIn: bigint
  gramOut: bigint
  fees: bigint
  /** Balance change over the period (sum of every transaction's exact balance change). */
  netChange: bigint
  swaps: number
  nftsBought: number
  nftSpent: bigint
  nftsSold: number
  nftsReceived: number
  nftsSent: number
  tokens: TokenStat[]
  counterparties: CounterpartyStat[]
  /** Busiest local day (YYYY-MM-DD) by number of actions. */
  busiestDay: { day: string, count: number } | null
  /** Actions per calendar month (local), index 0 = the month the period starts in. */
  months: number[]
  firstActive: number | null
  lastActive: number | null
  truncated: boolean
}

export const rawUpper = (a: string) => Address.parse(a).toRawString().toUpperCase()
const big = (v: unknown) => {
  try {
    return typeof v === 'string' || typeof v === 'number' ? BigInt(v) : 0n
  }
  catch {
    return 0n
  }
}
const str = (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : null)
const dayKey = (t: number) => new Date(t * 1000).toLocaleDateString('en-CA')

function tokenMeta(master: string, meta: V3Metadata): { symbol: string, decimals: number, scam: boolean } {
  const info = meta[master]?.token_info?.find(t => t.type === 'jetton_masters')
  const known = KNOWN_JETTONS.find(k => rawUpper(k.master) === master)
  const symbol = info?.symbol || known?.symbol || `${master.slice(2, 6)}…${master.slice(-4)}`
  const decimals = info?.extra?.decimals != null ? jettonDecimals({ decimals: info.extra.decimals }) : known?.decimals ?? 9
  return { symbol, decimals, scam: info?.is_scam === true }
}

/** Folds a period of actions + transactions into the numbers on the card. `me` is any address form. */
export function wrap(meInput: string, from: number, to: number, data: ActivityData): Wrapped {
  const me = rawUpper(meInput)
  const tokens = new Map<string, TokenStat>()
  const parties = new Map<string, CounterpartyStat>()
  const days = new Map<string, number>()
  const months: number[] = Array.from({ length: 12 }, () => 0)
  const start = new Date(from * 1000)
  const m0 = start.getFullYear() * 12 + start.getMonth()
  let gramIn = 0n
  let gramOut = 0n
  let swaps = 0
  let nftsBought = 0
  let nftSpent = 0n
  let nftsSold = 0
  let nftsReceived = 0
  let nftsSent = 0
  let first: number | null = null
  let last: number | null = null

  const token = (master: string) => {
    let t = tokens.get(master)
    if (!t) {
      const m = tokenMeta(master, data.metadata)
      if (m.scam) return null
      t = { master, symbol: m.symbol, decimals: m.decimals, uses: 0, sent: 0n, received: 0n }
      tokens.set(master, t)
    }
    return t
  }
  const party = (addr: string | null) => {
    if (!addr || addr === me) return null
    let p = parties.get(addr)
    if (!p) {
      const b = data.addressBook[addr]
      p = { address: addr, friendly: b?.user_friendly ?? addr, domain: b?.domain ?? null, count: 0, gramIn: 0n, gramOut: 0n }
      parties.set(addr, p)
    }
    p.count++
    return p
  }

  for (const a of data.actions) {
    const d = a.details
    const t = a.start_utime
    first = first === null ? t : Math.min(first, t)
    last = last === null ? t : Math.max(last, t)
    const day = dayKey(t)
    days.set(day, (days.get(day) ?? 0) + 1)
    const dt = new Date(t * 1000)
    const mi = dt.getFullYear() * 12 + dt.getMonth() - m0
    if (mi >= 0 && mi < 12) months[mi]!++
    if (!a.success) continue

    switch (a.type) {
      case 'ton_transfer': {
        const src = str(d.source)
        const dst = str(d.destination)
        const v = big(d.value)
        if (dst === me && src !== me) {
          gramIn += v
          const p = party(src)
          if (p) p.gramIn += v
        }
        else if (src === me && dst !== me) {
          gramOut += v
          const p = party(dst)
          if (p) p.gramOut += v
        }
        break
      }
      case 'jetton_transfer': {
        const master = str(d.asset)
        const tk = master ? token(master) : null
        const v = big(d.amount)
        if (str(d.sender) === me) {
          if (tk) {
            tk.uses++
            tk.sent += v
          }
          party(str(d.receiver))
        }
        else if (str(d.receiver) === me) {
          if (tk) tk.received += v
          party(str(d.sender))
        }
        break
      }
      case 'jetton_swap': {
        swaps++
        const tin = str(d.asset_in)
        const tout = str(d.asset_out)
        const inc = d.dex_incoming_transfer as { amount?: string } | undefined
        const outg = d.dex_outgoing_transfer as { amount?: string } | undefined
        if (tin) {
          const tk = token(tin)
          if (tk) {
            tk.uses++
            tk.sent += big(inc?.amount)
          }
        }
        if (tout) {
          const tk = token(tout)
          if (tk) {
            tk.uses++
            tk.received += big(outg?.amount)
          }
        }
        break
      }
      case 'nft_purchase':
      case 'dns_purchase': {
        if (str(d.new_owner) === me) {
          nftsBought++
          nftSpent += big(d.price)
        }
        else if (str(d.old_owner) === me) nftsSold++
        break
      }
      case 'nft_transfer': {
        if (d.is_purchase) break
        if (str(d.new_owner) === me) nftsReceived++
        else if (str(d.old_owner) === me) nftsSent++
        break
      }
    }
  }

  let busiest: Wrapped['busiestDay'] = null
  for (const [day, count] of days) if (!busiest || count > busiest.count) busiest = { day, count }

  const byUse = (a: TokenStat, b: TokenStat) => b.uses - a.uses || Number(b.received > a.received) - Number(b.received < a.received)
  return {
    address: me,
    domain: data.addressBook[me]?.domain ?? null,
    from,
    to,
    actions: data.actions.length,
    transactions: data.transactions.length,
    gramIn,
    gramOut,
    fees: data.transactions.reduce((s, t) => s + txFees(t), 0n),
    netChange: data.transactions.reduce((s, t) => s + txBalanceDelta(t), 0n),
    swaps,
    nftsBought,
    nftSpent,
    nftsSold,
    nftsReceived,
    nftsSent,
    // Tokens only received and never used are mostly airdrop spam: keep them out of the "top tokens" list.
    tokens: [...tokens.values()].filter(t => t.uses > 0).sort(byUse).slice(0, 5),
    counterparties: [...parties.values()].sort((a, b) => b.count - a.count || Number(b.gramIn + b.gramOut - a.gramIn - a.gramOut > 0n) - Number(b.gramIn + b.gramOut - a.gramIn - a.gramOut < 0n)).slice(0, 5),
    busiestDay: busiest,
    months,
    firstActive: first,
    lastActive: last,
    truncated: data.truncated
  }
}

// ---------------------------------------------------------------- loading

/** Local-time start and end (unix seconds) of a calendar year, the end capped at `now`. */
export function yearRange(year: number, now = Math.floor(Date.now() / 1000)): { from: number, to: number } {
  const from = Math.floor(new Date(year, 0, 1).getTime() / 1000)
  const to = Math.min(Math.floor(new Date(year + 1, 0, 1).getTime() / 1000) - 1, now)
  return { from, to }
}

export interface LoadOptions {
  /** Pages of 1000 for each of actions and transactions. */
  maxPages?: number
  onProgress?: (text: string) => void
  signal?: { aborted: boolean }
}

/** Every action and transaction of `address` in [from, to] from toncenter v3 (1000 per request). */
export async function loadActivity(v3: V3Fetch, address: string, from: number, to: number, { maxPages = 5, onProgress, signal }: LoadOptions = {}): Promise<ActivityData> {
  const actions: V3Action[] = []
  const metadata: V3Metadata = {}
  const addressBook: V3AddressBook = {}
  let truncated = true
  for (let page = 0; page < maxPages && !signal?.aborted; page++) {
    const r = await v3<{ actions: V3Action[], metadata?: V3Metadata, address_book?: V3AddressBook }>('actions', {
      account: address, start_utime: from, end_utime: to, sort: 'asc', limit: 1000, offset: page * 1000
    })
    actions.push(...r.actions)
    Object.assign(metadata, r.metadata)
    Object.assign(addressBook, r.address_book)
    onProgress?.(`Loaded ${actions.length} actions…`)
    if (r.actions.length < 1000) {
      truncated = false
      break
    }
  }
  const tx = await fetchTransactions(v3, address, { start_utime: from, end_utime: to }, {
    maxPages, signal, onPage: n => onProgress?.(`Loaded ${n} transactions…`)
  })
  return { actions, transactions: tx.transactions, metadata, addressBook, truncated: truncated || tx.truncated }
}

// ---------------------------------------------------------------- shareable card (SVG, also rendered to PNG)

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const short = (s: string) => (s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s)
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Human period label: "2026" for a whole year, else "1 Oct 2026 – 15 Oct 2026". */
export function periodLabel(from: number, to: number): string {
  const a = new Date(from * 1000)
  const b = new Date(to * 1000)
  if (a.getMonth() === 0 && a.getDate() === 1 && a.getHours() === 0 && a.getFullYear() === b.getFullYear()) return String(a.getFullYear())
  const f = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f(a)} – ${f(b)}`
}

/** 1080×1350 summary card. `friendly` is the user-friendly address shown on it. */
export function cardSvg(w: Wrapped, friendly: string): string {
  const coin = (v: bigint) => formatCoin(v, { maxDecimals: v >= 10n ** 12n ? 0 : 2 })
  const tiles: [string, string][] = [
    ['Actions', String(w.actions)],
    [`${COIN_SYMBOL} received`, coin(w.gramIn)],
    [`${COIN_SYMBOL} sent`, coin(w.gramOut)],
    ['Network fees', formatCoin(w.fees, { maxDecimals: 3 })],
    ['Swaps', String(w.swaps)],
    ['NFTs bought', String(w.nftsBought)]
  ]
  const parts: string[] = []
  tiles.forEach(([label, value], i) => {
    const x = 80 + (i % 2) * 470
    const y = 330 + Math.floor(i / 2) * 150
    parts.push(
      `<rect x="${x}" y="${y}" width="450" height="130" rx="24" fill="#ffffff" fill-opacity="0.07"/>`,
      `<text x="${x + 32}" y="${y + 48}" font-size="26" fill="#9fd8ff">${esc(label)}</text>`,
      `<text x="${x + 32}" y="${y + 100}" font-size="${value.length > 16 ? 34 : 44}" font-weight="700" fill="#fff">${esc(value)}</text>`
    )
  })
  // Month bars, starting at the period's first month ("Last 12 months" does not start in January).
  const firstMonth = new Date(w.from * 1000).getMonth()
  const peak = Math.max(1, ...w.months)
  w.months.forEach((n, i) => {
    const h = Math.round((n / peak) * 120)
    const x = 80 + i * 77
    parts.push(
      `<rect x="${x}" y="${930 - h}" width="56" height="${Math.max(h, 3)}" rx="8" fill="#2aa8ff" fill-opacity="${n ? 1 : 0.25}"/>`,
      `<text x="${x + 28}" y="${966}" font-size="22" fill="#9fd8ff" text-anchor="middle">${MONTHS[(firstMonth + i) % 12]}</text>`
    )
  })
  const list = (x: number, title: string, rows: string[]) => {
    parts.push(`<text x="${x}" y="1040" font-size="26" fill="#9fd8ff">${esc(title)}</text>`)
    if (!rows.length) parts.push(`<text x="${x}" y="1088" font-size="30" fill="#fff" fill-opacity="0.5">—</text>`)
    rows.slice(0, 3).forEach((r, i) => parts.push(`<text x="${x}" y="${1088 + i * 46}" font-size="32" font-weight="600" fill="#fff">${i + 1}. ${esc(r)}</text>`))
  }
  list(80, 'Top tokens', w.tokens.map(t => t.symbol.slice(0, 14)))
  list(550, 'Top counterparties', w.counterparties.map(c => c.domain ?? short(c.friendly)))
  const busiest = w.busiestDay ? `Busiest day: ${new Date(`${w.busiestDay.day}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} (${w.busiestDay.count} actions)` : 'No activity in this period'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350" font-family="Onest, 'Helvetica Neue', Arial, sans-serif">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a2e"/><stop offset="1" stop-color="#0064b4"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#g)"/>
<text x="80" y="120" font-size="30" letter-spacing="6" fill="#9fd8ff">MY TON WRAPPED</text>
<text x="80" y="200" font-size="72" font-weight="800" fill="#fff">${esc(periodLabel(w.from, w.to))}</text>
<text x="80" y="262" font-size="34" fill="#fff" fill-opacity="0.85">${esc(w.domain ?? short(friendly))}</text>
${parts.join('\n')}
<text x="80" y="1270" font-size="28" fill="#fff" fill-opacity="0.85">${esc(busiest)}</text>
<text x="1000" y="1300" font-size="24" fill="#9fd8ff" text-anchor="end">tonutils.io</text>
</svg>`
}
