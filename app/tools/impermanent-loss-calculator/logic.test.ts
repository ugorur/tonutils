import { describe, expect, it } from 'vitest'
import { breakEvenApr, curve, impermanentLoss, simulate, validate } from './logic'

describe('impermanentLoss', () => {
  // Reference table from Pintail, "Uniswap: A Good Deal for Liquidity Providers?" (2019), reproduced in
  // Bancor's impermanent loss docs: 1.25x 0.6%, 1.5x 2.0%, 1.75x 3.8%, 2x 5.7%, 3x 13.4%, 4x 20.0%, 5x 25.5%.
  it.each([
    [1.25, 0.6],
    [1.5, 2.0],
    [1.75, 3.8],
    [2, 5.7],
    [3, 13.4],
    [4, 20.0],
    [5, 25.5]
  ])('a %sx price change loses %s%%', (r, pct) => {
    expect(-impermanentLoss(r) * 100).toBeCloseTo(pct, 1)
  })

  it('is symmetric: halving loses the same as doubling, and no move loses nothing', () => {
    expect(impermanentLoss(0.5)).toBeCloseTo(impermanentLoss(2), 12)
    expect(impermanentLoss(1)).toBe(0)
  })

  it('rejects non-positive ratios', () => {
    expect(() => impermanentLoss(0)).toThrow()
    expect(() => impermanentLoss(-2)).toThrow()
    expect(() => impermanentLoss(Number.NaN)).toThrow()
  })
})

describe('simulate', () => {
  // Binance Academy, "Impermanent Loss Explained": 1 ETH + 100 DAI at 100 DAI/ETH; ETH goes to 400.
  // The pool then holds 0.5 ETH + 200 DAI = 400 DAI, versus 500 DAI for holding: a 20% loss.
  const r = simulate({ deposit: 200, priceA0: 100, priceA1: 400, priceB0: 1, priceB1: 1 })

  it('reproduces the textbook ETH/DAI example', () => {
    expect(r.ratio).toBe(4)
    expect(r.entry.a).toBeCloseTo(1, 12)
    expect(r.entry.b).toBeCloseTo(100, 12)
    expect(r.now.a).toBeCloseTo(0.5, 12)
    expect(r.now.b).toBeCloseTo(200, 12)
    expect(r.lpValue).toBeCloseTo(400, 9)
    expect(r.holdValue).toBeCloseTo(500, 9)
    expect(r.difference).toBeCloseTo(-100, 9)
    expect(r.il).toBeCloseTo(-0.2, 12)
    expect(r.lpValue / r.holdValue - 1).toBeCloseTo(r.il, 12)
  })

  it('needs fees of 25% of the position to break even on a 20% loss', () => {
    expect(r.breakEvenFees).toBeCloseTo(0.25, 12)
    expect(breakEvenApr(0.25, 365)).toBeCloseTo(0.25, 12)
    expect(breakEvenApr(0.25, 73)).toBeCloseTo(1.25, 12)
  })

  it('only the ratio matters: both tokens moving together cause no loss', () => {
    const both = simulate({ deposit: 1000, priceA0: 2, priceA1: 3, priceB0: 4, priceB1: 6 })
    expect(both.il).toBeCloseTo(0, 12)
    expect(both.lpValue).toBeCloseTo(both.holdValue, 9)
  })

  it('validates inputs', () => {
    expect(validate({ deposit: 0, priceA0: 1, priceA1: 1, priceB0: 1, priceB1: 1 })).toMatch(/Deposit/)
    expect(() => simulate({ deposit: 1, priceA0: 1, priceA1: Number.NaN, priceB0: 1, priceB1: 1 })).toThrow(/Token A current price/)
  })
})

describe('curve', () => {
  it('spans the range log-evenly and bottoms out at 1x', () => {
    const c = curve(0.1, 10, 21)
    expect(c[0]!.r).toBeCloseTo(0.1, 12)
    expect(c[20]!.r).toBeCloseTo(10, 12)
    expect(c[10]!.r).toBeCloseTo(1, 12)
    expect(c[10]!.il).toBeCloseTo(0, 12)
    expect(Math.max(...c.map(p => p.il))).toBeCloseTo(0, 12)
  })
})
