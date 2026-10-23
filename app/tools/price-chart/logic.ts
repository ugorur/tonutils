// Price history from tonapi GET /v2/rates/chart. Pure TS.

export type Point = [ts: number, price: number]

export interface Range { id: string, label: string, seconds: number | null }

/** tonapi returns at most 200 points; history starts in 2022 (earlier start dates are rejected). */
export const MAX_POINTS = 200
export const HISTORY_START = 1640995200 // 2022-01-01 UTC

export const RANGES: Range[] = [
  { id: '1d', label: '24H', seconds: 86400 },
  { id: '7d', label: '7D', seconds: 7 * 86400 },
  { id: '30d', label: '1M', seconds: 30 * 86400 },
  { id: '90d', label: '3M', seconds: 90 * 86400 },
  { id: '1y', label: '1Y', seconds: 365 * 86400 },
  { id: 'max', label: 'Max', seconds: null }
]

/** `token`: 'ton' or a jetton master; `currency`: 'usd', 'eur', … or 'ton' (price in GRAM). */
export function chartQuery(token: string, currency: string, range: Range, now = Math.floor(Date.now() / 1000)) {
  const start = range.seconds === null ? HISTORY_START : Math.max(HISTORY_START, now - range.seconds)
  return { token, currency: currency.toLowerCase(), start_date: start, end_date: now, points_count: MAX_POINTS }
}

/** tonapi sends newest first; return oldest first, one point per timestamp, finite prices only. */
export function normalizePoints(points: Point[]): Point[] {
  const byTs = new Map<number, number>()
  for (const [t, p] of points) if (Number.isFinite(t) && Number.isFinite(p)) byTs.set(t, p)
  return [...byTs.entries()].sort((a, b) => a[0] - b[0])
}

export interface ChartStats {
  first: Point
  last: Point
  /** Percent change from first to last point. */
  change: number
  high: Point
  low: Point
}

export function chartStats(points: Point[]): ChartStats | null {
  if (!points.length) return null
  let high = points[0]!
  let low = points[0]!
  for (const p of points) {
    if (p[1] > high[1]) high = p
    if (p[1] < low[1]) low = p
  }
  const first = points[0]!
  const last = points.at(-1)!
  return { first, last, change: first[1] ? (last[1] / first[1] - 1) * 100 : 0, high, low }
}

export function csvRows(points: Point[], currency: string) {
  return points.map(([t, p]) => ({ time_utc: new Date(t * 1000).toISOString(), unix: t, [`price_${currency.toLowerCase()}`]: p }))
}
