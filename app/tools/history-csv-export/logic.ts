import type { CsvRow } from '~/utils/csv'
import { COIN_SYMBOL } from '~/utils/currency'
import { formatAmount } from '~/utils/units'
import { explorerUrl } from '~/utils/ton/explorers'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { Asset, TaAccount, TaEvent } from '~/lib/tx-user/events'
import { COIN_ASSET, assetKey, describeAction, friendlyAddress, viewerFee } from '~/lib/tx-user/events'
import type { RatePoint } from '~/lib/tx-user/rates'
import { fiatValue, priceAt } from '~/lib/tx-user/rates'

export const PAGE_LIMIT = 100

export interface Movement {
  time: number
  eventId: string
  type: string
  title: string
  direction: 'in' | 'out'
  asset: Asset
  /** Absolute base units. */
  amount: bigint
  counterparty?: TaAccount
  comment?: string
}

export interface EventRecord {
  eventId: string
  time: number
  ok: boolean
  spam: boolean
  title: string
  /** nanoGRAM paid by this account in fees. */
  fee: bigint
  movements: Movement[]
}

/**
 * One account event -> value movements (+ fee). Sum of signed movements minus the fee equals the
 * account's balance change for the event: tonapi's `extra` is what the actions do not explain.
 */
export function eventRecord(ev: TaEvent, viewer: string): EventRecord {
  const views = ev.actions.map(a => describeAction(a, viewer))
  const { fee, otherIn } = viewerFee(ev, views, viewer)
  const movements: Movement[] = []
  for (const v of views) {
    for (const f of v.flows) {
      movements.push({
        time: ev.timestamp,
        eventId: ev.event_id,
        type: v.type,
        title: v.title,
        direction: f.amount < 0n ? 'out' : 'in',
        asset: f.asset,
        amount: f.amount < 0n ? -f.amount : f.amount,
        counterparty: v.counterparty,
        comment: v.comment
      })
    }
  }
  if (otherIn > 0n) {
    movements.push({ time: ev.timestamp, eventId: ev.event_id, type: 'Refund', title: 'Excess / refund returned', direction: 'in', asset: COIN_ASSET, amount: otherIn })
  }
  return {
    eventId: ev.event_id,
    time: ev.timestamp,
    ok: views.every(v => v.ok),
    spam: !!ev.is_scam || views.some(v => v.spam),
    title: views.map(v => (v.ok ? v.title : `Failed: ${v.title}`)).join('; '),
    fee,
    movements
  }
}

export type ExportFormat = 'detailed' | 'koinly'

export interface FiatPrices {
  currency: string
  /** assetKey -> daily points. Missing key = no price for that token. */
  points: Map<string, RatePoint[]>
}

export interface RowOptions {
  format: ExportFormat
  network: TonNetwork
  includeFailed: boolean
  hideSpam: boolean
  fiat?: FiatPrices
}

/** "2026-10-21 14:25 UTC" (Koinly's date format) */
export function utcMinute(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

function utcSecond(time: number): string {
  return new Date(time * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

/** Comments, names and token symbols are untrusted on-chain text: stop spreadsheets from running them as formulas. */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function plain(units: bigint, decimals: number): string {
  return formatAmount(units, decimals, { group: false })
}

function counterpartyText(a: TaAccount | undefined, testOnly: boolean): string {
  return a?.address ? friendlyAddress(a.address, a.is_wallet ?? true, testOnly) : ''
}

function price(fiat: FiatPrices | undefined, asset: Asset, time: number): number | null {
  const pts = fiat?.points.get(assetKey(asset))
  return pts ? priceAt(pts, time) : null
}

export function detailedColumns(currency?: string): string[] {
  return [
    'Date (UTC)', 'Type', 'Description', 'Direction', 'Amount', 'Token', 'Token contract',
    'Counterparty', 'Counterparty name', 'Comment', `Fee (${COIN_SYMBOL})`,
    ...(currency ? [`Price (${currency})`, `Value (${currency})`, `Fee value (${currency})`] : []),
    'Status', 'Tx hash', 'Explorer link'
  ]
}

export const KOINLY_COLUMNS = ['Date', 'Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency', 'Fee Amount', 'Fee Currency', 'Net Worth Amount', 'Net Worth Currency', 'Label', 'Description', 'TxHash']

export function columnsFor(opts: Pick<RowOptions, 'format' | 'fiat'>): string[] {
  return opts.format === 'koinly' ? KOINLY_COLUMNS : detailedColumns(opts.fiat?.currency)
}

export function keepRecord(r: EventRecord, opts: Pick<RowOptions, 'includeFailed' | 'hideSpam'>): boolean {
  if (opts.hideSpam && r.spam) return false
  if (!r.ok && !opts.includeFailed && !r.movements.length) return false
  return r.movements.length > 0 || r.fee > 0n
}

function detailedRows(r: EventRecord, opts: RowOptions): CsvRow[] {
  const testOnly = opts.network === 'testnet'
  const link = explorerUrl('tonviewer', 'tx', r.eventId, opts.network) ?? ''
  const cur = opts.fiat?.currency
  const coinPrice = price(opts.fiat, COIN_ASSET, r.time)
  const feeCell = (first: boolean) => (first && r.fee > 0n ? plain(r.fee, COIN_ASSET.decimals) : '')
  const feeFiat = (first: boolean) => (first && r.fee > 0n && coinPrice !== null ? fiatValue(r.fee, COIN_ASSET.decimals, coinPrice).toFixed(2) : '')
  const common = (first: boolean): CsvRow => ({
    'Date (UTC)': utcSecond(r.time),
    [`Fee (${COIN_SYMBOL})`]: feeCell(first),
    ...(cur ? { [`Fee value (${cur})`]: feeFiat(first) } : {}),
    'Status': r.ok ? 'ok' : 'failed',
    'Tx hash': r.eventId,
    'Explorer link': link
  })
  if (!r.movements.length) {
    return [{ ...common(true), 'Type': 'Fee', 'Description': safeText(r.title), 'Direction': 'out' }]
  }
  return r.movements.map((m, i) => {
    const p = price(opts.fiat, m.asset, m.time)
    return {
      ...common(i === 0),
      'Type': m.type,
      'Description': safeText(m.title),
      'Direction': m.direction,
      'Amount': plain(m.amount, m.asset.decimals),
      'Token': safeText(m.asset.symbol),
      'Token contract': m.asset.master ? friendlyAddress(m.asset.master, false, testOnly) : '',
      'Counterparty': counterpartyText(m.counterparty, testOnly),
      'Counterparty name': safeText(m.counterparty?.name ?? ''),
      'Comment': safeText(m.comment ?? ''),
      ...(cur ? { [`Price (${cur})`]: p ?? '', [`Value (${cur})`]: p === null ? '' : fiatValue(m.amount, m.asset.decimals, p).toFixed(2) } : {})
    }
  })
}

/** Koinly matches plain ASCII tickers: "USD₮" -> "USDT". */
export function koinlyTicker(symbol: string): string {
  return safeText(symbol.replace(/₮/g, 'T'))
}

function koinlyRows(r: EventRecord, opts: RowOptions): CsvRow[] {
  const outs = r.movements.filter(m => m.direction === 'out')
  const ins = r.movements.filter(m => m.direction === 'in')
  // One sent + one received in the same event is a trade (swap); everything else is one row per movement.
  const pairs: Array<{ out?: Movement, in?: Movement }> = outs.length === 1 && ins.length === 1
    ? [{ out: outs[0], in: ins[0] }]
    : [...outs.map(m => ({ out: m })), ...ins.map(m => ({ in: m }))]
  if (!pairs.length) pairs.push({})
  const cur = opts.fiat?.currency
  return pairs.map((p, i) => {
    const worthSide = p.in ?? p.out
    const px = worthSide ? price(opts.fiat, worthSide.asset, r.time) : null
    const desc = [worthSide?.title ?? r.title, worthSide?.comment ? `comment: ${worthSide.comment}` : ''].filter(Boolean).join(' · ')
    return {
      'Date': utcMinute(r.time),
      'Sent Amount': p.out ? plain(p.out.amount, p.out.asset.decimals) : '',
      'Sent Currency': koinlyTicker(p.out?.asset.symbol ?? ''),
      'Received Amount': p.in ? plain(p.in.amount, p.in.asset.decimals) : '',
      'Received Currency': koinlyTicker(p.in?.asset.symbol ?? ''),
      'Fee Amount': i === 0 && r.fee > 0n ? plain(r.fee, COIN_ASSET.decimals) : '',
      'Fee Currency': i === 0 && r.fee > 0n ? COIN_SYMBOL : '',
      'Net Worth Amount': cur && worthSide && px !== null ? fiatValue(worthSide.amount, worthSide.asset.decimals, px).toFixed(2) : '',
      'Net Worth Currency': cur && worthSide && px !== null ? cur : '',
      'Label': '',
      'Description': safeText(desc),
      'TxHash': r.eventId
    }
  })
}

/** Records (newest first from tonapi) -> CSV rows, oldest first like a ledger. */
export function buildRows(records: EventRecord[], opts: RowOptions): CsvRow[] {
  const kept = records.filter(r => keepRecord(r, opts)).sort((a, b) => a.time - b.time)
  return kept.flatMap(r => (opts.format === 'koinly' ? koinlyRows(r, opts) : detailedRows(r, opts)))
}

export interface TokenTotal {
  asset: Asset
  received: bigint
  sent: bigint
}

/** Per-token totals plus total fees, for the summary above the download button. */
export function totals(records: EventRecord[], opts: Pick<RowOptions, 'includeFailed' | 'hideSpam'>): { tokens: TokenTotal[], fees: bigint, events: number } {
  const map = new Map<string, TokenTotal>()
  let fees = 0n
  let events = 0
  for (const r of records) {
    if (!keepRecord(r, opts)) continue
    events++
    fees += r.fee
    for (const m of r.movements) {
      const t = map.get(assetKey(m.asset)) ?? { asset: m.asset, received: 0n, sent: 0n }
      if (m.direction === 'in') t.received += m.amount
      else t.sent += m.amount
      map.set(assetKey(m.asset), t)
    }
  }
  return { tokens: [...map.values()], fees, events }
}

/** Unix-second bounds for a pair of <input type="date"> values, interpreted as whole UTC days. */
export function dateBounds(from: string, to: string): { start: number, end: number } {
  const start = Date.parse(`${from}T00:00:00Z`) / 1000
  const end = Date.parse(`${to}T23:59:59Z`) / 1000
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Pick both dates.')
  if (start > end) throw new Error('The start date is after the end date.')
  return { start, end }
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function presetRange(preset: 'last30' | 'thisYear' | 'lastYear', now = new Date()): { from: string, to: string } {
  const y = now.getUTCFullYear()
  if (preset === 'thisYear') return { from: `${y}-01-01`, to: isoDay(now) }
  if (preset === 'lastYear') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  return { from: isoDay(new Date(now.getTime() - 29 * 86_400_000)), to: isoDay(now) }
}
