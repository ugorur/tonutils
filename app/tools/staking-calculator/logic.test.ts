import { describe, expect, it } from 'vitest'
import { KIND_FEES, project } from './logic'

const N = 31536000 / 65536 // 481.2…
const base = { principal: 1000, apy: 12, cycleSeconds: 65536, days: 365, compound: true, entryFee: 0, exitFee: 0 }

describe('project', () => {
  it('compounding every round reproduces the APY over a year of whole rounds', () => {
    const p = project(base)
    // 365 days = 481 full rounds of 65536 s (31536000 / 65536 = 481.2).
    expect(p.end.cycles).toBe(481)
    expect(p.cyclesPerYear).toBeCloseTo(481.2012, 3)
    // (1.12)^(481/481.2) - 1 ≈ 11.995 %: slightly under 12 % because the last partial round is not paid yet.
    expect(p.end.rewards).toBeCloseTo(1000 * (1.12 ** (481 / N) - 1), 6)
    expect(p.perYear).toBeCloseTo(120, 6)
    expect(p.effectiveApy).toBe(12)
  })
  it('without compounding the yield is the per-round rate times rounds (APR)', () => {
    const p = project({ ...base, compound: false })
    const r = 1.12 ** (1 / N) - 1
    expect(p.ratePerCycle).toBeCloseTo(r, 12)
    expect(p.effectiveApy).toBeCloseTo(r * N * 100, 9)
    expect(p.effectiveApy).toBeLessThan(12)
    expect(p.end.rewards).toBeCloseTo(1000 * r * 481, 9)
  })
  it('pays only at whole cycles (TON Whales: every other round)', () => {
    const p = project({ ...base, cycleSeconds: 131072, days: 1 })
    expect(p.end.cycles).toBe(0)
    expect(p.end.rewards).toBe(0)
    expect(project({ ...base, cycleSeconds: 131072, days: 2 }).end.cycles).toBe(1)
  })
  it('subtracts fees and computes break-even', () => {
    const p = project({ ...base, principal: 50, entryFee: KIND_FEES.whales.entry, exitFee: KIND_FEES.whales.exit })
    expect(p.netProfit).toBeCloseTo(p.end.rewards - 0.4, 9)
    expect(p.breakEvenDays).toBe(Math.ceil(0.4 / p.perDay))
    expect(project({ ...base, apy: 0, entryFee: 1, exitFee: 0 }).breakEvenDays).toBeNull()
    expect(project(base).breakEvenDays).toBe(0)
  })
  it('lists the usual milestones', () => {
    expect(project(base).milestones.map(m => m.label)).toEqual(['1 month', '3 months', '6 months', '1 year', '3 years'])
  })
})

describe('fees', () => {
  // TON Whales get_params on Tonkeeper Queue #1 (tonapi, 2026-10-23): deposit_fee = withdraw_fee = receipt_price = 0.1 GRAM.
  // TON Core nominator-pool func/pool.fc: DEPOSIT_PROCESSING_FEE = 1 TON.
  it('matches the contracts', () => {
    expect(KIND_FEES.whales.entry).toBe(0.1 + 0.1)
    expect(KIND_FEES.whales.exit).toBe(0.1 + 0.1)
    expect(KIND_FEES.tf.entry).toBe(1)
  })
})
