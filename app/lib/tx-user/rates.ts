// Historical fiat prices from tonapi /v2/rates/chart (keyless). Pure TS.
// The chart returns at most 200 points. Windows of ~180 days come back as one point per day (00:00 UTC);
// short windows older than a few months come back empty, so we always ask in 180-day windows.
import { formatUnits } from '~/utils/units'
import type { Asset } from './events'

export type RatePoint = [number, number]
export type TonapiGet = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

export const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'RUB', 'TRY', 'INR', 'UAH', 'JPY', 'CNY'] as const

const DAY = 86_400
const WINDOW = 180 * DAY

/** 180-day [start, end] windows covering [from - 1 day, to + 1 day], never past `now`. */
export function rateWindows(from: number, to: number, now = Math.floor(Date.now() / 1000)): Array<[number, number]> {
  const end = Math.min(to + DAY, now)
  const out: Array<[number, number]> = []
  // Walk backwards from the end so the newest window is always a full 180 days.
  for (let e = end; e > from - DAY; e -= WINDOW) out.push([e - WINDOW, e])
  return out
}

/** Price at the point nearest to `ts`, if one is within `maxGap` seconds (default 2 days). */
export function priceAt(points: RatePoint[], ts: number, maxGap = 2 * DAY): number | null {
  let best: RatePoint | null = null
  for (const p of points) if (!best || Math.abs(p[0] - ts) < Math.abs(best[0] - ts)) best = p
  return best && Math.abs(best[0] - ts) <= maxGap ? best[1] : null
}

/** Fiat value of a base-unit amount, rounded to cents. */
export function fiatValue(units: bigint, decimals: number, price: number): number {
  const abs = units < 0n ? -units : units
  return Math.round(Number(formatUnits(abs, decimals)) * price * 100) / 100
}

/** tonapi token id for the chart: "ton" for the native coin, the jetton master otherwise. */
export function rateToken(asset: Asset): string {
  return asset.master ?? 'ton'
}

/** Daily price points for one asset over [from, to] (unix seconds). One request per 180 days. */
export async function fetchRatePoints(get: TonapiGet, asset: Asset, currency: string, from: number, to: number): Promise<RatePoint[]> {
  const points: RatePoint[] = []
  for (const [start, end] of rateWindows(from, to)) {
    const res = await get<{ points?: RatePoint[] }>('rates/chart', { token: rateToken(asset), currency: currency.toLowerCase(), start_date: start, end_date: end, points_count: 200 })
    points.push(...(res.points ?? []))
  }
  return points
}
