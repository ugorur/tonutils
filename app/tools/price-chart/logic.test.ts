import { describe, expect, it } from 'vitest'
import { HISTORY_START, MAX_POINTS, RANGES, chartQuery, chartStats, csvRows, normalizePoints } from './logic'
import type { Point } from './logic'
// https://tonapi.io/v2/rates/chart?token=ton&currency=usd&points_count=200&start_date=1792134000&end_date=1792738800, fetched 2026-10-23.
import fixture from './fixture-chart.json'
// https://tonapi.io/v2/rates?tokens=ton,…&currencies=ton,usd,… fetched the same minute (other tool's fixture).
import rates from '../price-converter/fixture-rates.json'

const raw = fixture.points as Point[]

describe('normalizePoints', () => {
  it('sorts oldest first and drops duplicates', () => {
    const pts = normalizePoints(raw)
    expect(raw[0]![0]).toBeGreaterThan(raw.at(-1)![0]) // tonapi: newest first
    expect(pts.length).toBe(new Set(raw.map(p => p[0])).size)
    for (let i = 1; i < pts.length; i++) expect(pts[i]![0]).toBeGreaterThan(pts[i - 1]![0])
    expect(normalizePoints([[3, 1], [1, 2], [3, 5], [2, Number.NaN]])).toEqual([[1, 2], [3, 5]])
  })
})

describe('chartStats on real 7-day GRAM/USD history', () => {
  const s = chartStats(normalizePoints(raw))!
  it('high/low match the series (python max/min on the same JSON)', () => {
    expect(s.high[1]).toBe(1.3924665999999997)
    expect(s.low[1]).toBe(1.3069969535034711)
  })
  it('last point agrees with tonapi /v2/rates spot price within 0.5%', () => {
    expect(s.last[1] / rates.rates.TON.prices.USD).toBeCloseTo(1, 2)
  })
  it('change is last vs first', () => {
    expect(s.change).toBeCloseTo((s.last[1] / s.first[1] - 1) * 100, 10)
    expect(chartStats([])).toBeNull()
  })
})

describe('chartQuery', () => {
  const now = 1792738800
  it('uses the range and the 200-point cap', () => {
    expect(chartQuery('ton', 'USD', RANGES[1]!, now)).toEqual({ token: 'ton', currency: 'usd', start_date: now - 7 * 86400, end_date: now, points_count: MAX_POINTS })
  })
  it('max range starts at the first day tonapi accepts', () => {
    expect(chartQuery('ton', 'usd', RANGES.at(-1)!, now).start_date).toBe(HISTORY_START)
  })
})

it('csv rows carry ISO time and price', () => {
  expect(csvRows([[1792738800, 1.32]], 'USD')).toEqual([{ time_utc: '2026-10-23T07:00:00.000Z', unix: 1792738800, price_usd: 1.32 }])
})
