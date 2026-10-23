import type { AccountStatus } from '~/lib/accounts-history/state'
import type { V2Fetch, V3Fetch } from '~/utils/api-client'
import { fetchAccountAt } from '~/lib/accounts-history/state'
import type { V3Transaction } from '~/lib/accounts-history/transactions'
import { fetchTransactions, txBalanceDelta, txFees, txReceived, txSent } from '~/lib/accounts-history/transactions'

export interface BalancePoint {
  /** Unix seconds. */
  time: number
  status: AccountStatus
  balance: bigint
  /** Masterchain block the balance was read at (undefined = latest). */
  seqno?: number
  lastTxLt: string
}

export interface DayRow {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  change: bigint
  /** Balance at the end of that day. */
  balance: bigint
  txs: number
}

export interface BalanceDiff {
  start: BalancePoint
  end: BalancePoint
  /** end − start: exact, read from the chain state at both blocks. */
  change: bigint
  received: bigint
  sent: bigint
  fees: bigint
  txCount: number
  /** Too many transactions to load them all: totals, chart and days cover only the first `txCount`. */
  truncated: boolean
  /** start + every transaction's balance change === end. null when truncated. */
  reconciled: boolean | null
  /** Step series for the chart: the start, the balance after every transaction, the end. */
  series: { time: number, balance: bigint }[]
  days: DayRow[]
}

/** Local day key (YYYY-MM-DD) of a unix time. */
export const dayKey = (t: number) => new Date(t * 1000).toLocaleDateString('en-CA')

/** Balances at both ends plus the transactions between them, folded into totals, a series and per-day rows. */
export function summarize(start: BalancePoint, end: BalancePoint, txs: V3Transaction[], truncated: boolean): BalanceDiff {
  let balance = start.balance
  let received = 0n
  let sent = 0n
  let fees = 0n
  const series = [{ time: start.time, balance }]
  const days = new Map<string, DayRow>()
  for (const tx of txs) {
    const delta = txBalanceDelta(tx)
    balance += delta
    received += txReceived(tx)
    sent += txSent(tx)
    fees += txFees(tx)
    series.push({ time: tx.now, balance })
    const key = dayKey(tx.now)
    const d = days.get(key) ?? { day: key, change: 0n, balance, txs: 0 }
    d.change += delta
    d.balance = balance
    d.txs++
    days.set(key, d)
  }
  if (!truncated) series.push({ time: end.time, balance: end.balance })
  return {
    start,
    end,
    change: end.balance - start.balance,
    received,
    sent,
    fees,
    txCount: txs.length,
    truncated,
    reconciled: truncated ? null : balance === end.balance,
    series,
    days: [...days.values()]
  }
}

export interface DiffOptions {
  maxPages?: number
  onProgress?: (stage: string) => void
  /** Current unix time (tests). */
  now?: number
}

/**
 * Balance of `address` at `from` and at `to` (unix seconds), read from the account state at the masterchain block
 * of each moment (liteserver archive via toncenter v2), and every transaction in between (toncenter v3, by lt range
 * so the two ends line up exactly).
 */
export async function balanceDiff(v2: V2Fetch, v3: V3Fetch, address: string, from: number, to: number, opts: DiffOptions = {}): Promise<BalanceDiff> {
  if (to <= from) throw new Error('The end date must be after the start date.')
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const at = async (t: number): Promise<BalancePoint> => {
    if (t >= now - 5) {
      const s = await fetchAccountAt(v2, address)
      return { time: Math.min(t, now), status: s.status, balance: s.balance, lastTxLt: s.lastTxLt }
    }
    const { seqno } = await v2<{ seqno: number }>('lookupBlock', { workchain: -1, shard: '-9223372036854775808', unixtime: t })
    const s = await fetchAccountAt(v2, address, seqno)
    return { time: t, status: s.status, balance: s.balance, seqno, lastTxLt: s.lastTxLt }
  }
  opts.onProgress?.('Reading the balance at the start date…')
  const start = await at(from)
  opts.onProgress?.('Reading the balance at the end date…')
  const end = await at(to)
  if (BigInt(end.lastTxLt) <= BigInt(start.lastTxLt)) return summarize(start, end, [], false)
  opts.onProgress?.('Loading transactions…')
  const { transactions, truncated } = await fetchTransactions(
    v3,
    address,
    { start_lt: (BigInt(start.lastTxLt) + 1n).toString(), end_lt: end.lastTxLt },
    { maxPages: opts.maxPages, onPage: n => opts.onProgress?.(`Loaded ${n} transactions…`) }
  )
  return summarize(start, end, transactions, truncated)
}

/** Percentage change with one decimal, or null when the start balance is zero. */
export function percentChange(d: Pick<BalanceDiff, 'start' | 'change'>): string | null {
  if (d.start.balance === 0n) return null
  const bp = (d.change * 10000n) / d.start.balance
  const sign = bp < 0n ? '−' : '+'
  const abs = bp < 0n ? -bp : bp
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}%`
}

/**
 * Two `<input type="date">` values (YYYY-MM-DD, local) -> unix range: start of the first day to the end of the last
 * day (start of the next day), the end capped at `now`.
 */
export function dateRange(fromDay: string, toDay: string, now = Math.floor(Date.now() / 1000)): { from: number, to: number } | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  }
  const a = parse(fromDay)
  const b = parse(toDay)
  if (!a || !b) return null
  b.setDate(b.getDate() + 1)
  const from = Math.floor(a.getTime() / 1000)
  const to = Math.min(Math.floor(b.getTime() / 1000), now)
  return to > from ? { from, to } : null
}

/** SVG path (step line) for the balance series in a `w`×`h` box, plus the min/max balance it spans. */
export function stepPath(series: { time: number, balance: bigint }[], w: number, h: number): { d: string, min: bigint, max: bigint } {
  if (!series.length) return { d: '', min: 0n, max: 0n }
  let min = series[0]!.balance
  let max = min
  for (const p of series) {
    if (p.balance < min) min = p.balance
    if (p.balance > max) max = p.balance
  }
  const t0 = series[0]!.time
  const span = Math.max(1, series.at(-1)!.time - t0)
  const range = Number(max - min) || 1
  const x = (t: number) => ((t - t0) / span) * w
  const y = (b: bigint) => (max === min ? h / 2 : h - (Number(b - min) / range) * h)
  let d = `M${x(t0).toFixed(1)},${y(series[0]!.balance).toFixed(1)}`
  for (let i = 1; i < series.length; i++) {
    const p = series[i]!
    d += `H${x(p.time).toFixed(1)}V${y(p.balance).toFixed(1)}`
  }
  return { d, min, max }
}
