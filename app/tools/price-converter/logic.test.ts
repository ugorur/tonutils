import { describe, expect, it } from 'vitest'
import { NATIVE, POPULAR, fiatAsset, parsePercent } from '~/lib/prices-defi/assets'
import { convert, gramPer, priceChange, ratesQuery } from './logic'
import type { TonapiRates } from './logic'
// Captured from https://tonapi.io/v2/rates?tokens=ton,<USDT>,<NOT>&currencies=ton,usd,eur,try,gbp on 2026-10-23 07:11 UTC.
import fixture from './fixture-rates.json'

const r = fixture as TonapiRates
const USDT = POPULAR.find(a => a.symbol === 'USD₮')!
const NOT = POPULAR.find(a => a.symbol === 'NOT')!
const USD = fiatAsset('USD')
const EUR = fiatAsset('EUR')

describe('price conversion through GRAM', () => {
  it('GRAM to fiat uses the TON price directly', () => {
    expect(convert(10, NATIVE, USD, r)).toBeCloseTo(10 * r.rates.TON!.prices!.USD!, 9)
    expect(convert(1, USD, NATIVE, r)).toBeCloseTo(1 / r.rates.TON!.prices!.USD!, 9)
  })

  it('jetton to fiat via GRAM matches tonapi\'s own USD price for the jetton (within 0.5%)', () => {
    // Two independent series in the source: USDT/TON and TON/USD vs USDT/USD.
    for (const j of [USDT, NOT]) {
      const direct = r.rates[j.address]!.prices!.USD!
      expect(convert(1, j, USD, r)! / direct).toBeCloseTo(1, 2)
    }
    // USD₮ is a dollar stablecoin.
    expect(convert(100, USDT, USD, r)).toBeGreaterThan(99)
    expect(convert(100, USDT, USD, r)).toBeLessThan(101)
  })

  it('fiat cross rate EUR/USD from the GRAM pivot agrees with the USD₮ series', () => {
    const viaTon = convert(1, EUR, USD, r)!
    const viaUsdt = r.rates[USDT.address]!.prices!.USD! / r.rates[USDT.address]!.prices!.EUR!
    expect(viaTon / viaUsdt).toBeCloseTo(1, 2)
  })

  it('round trip is lossless and same asset is identity', () => {
    const x = convert(1234.5, NOT, EUR, r)!
    expect(convert(x, EUR, NOT, r)).toBeCloseTo(1234.5, 6)
    expect(convert(7, USDT, USDT, r)).toBeCloseTo(7, 12)
  })

  it('unknown jetton or currency has no price', () => {
    const odd = { ...USDT, address: 'EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE' }
    expect(gramPer(odd, r)).toBeNull()
    expect(convert(1, odd, USD, r)).toBeNull()
    expect(convert(1, NATIVE, fiatAsset('JPY'), r)).toBeNull()
  })
})

describe('price change', () => {
  it('reads tonapi diffs with the Unicode minus sign', () => {
    expect(parsePercent('−1.52%')).toBe(-1.52)
    expect(parsePercent('+0.22%')).toBe(0.22)
    expect(priceChange(USDT, USD, r)).toEqual({ d24: -0.02, d7: 0, d30: -0.11 })
    expect(priceChange(USDT, NATIVE, r)?.d24).toBe(1.39)
  })
  it('has no change for fiat/fiat or GRAM/GRAM', () => {
    expect(priceChange(USD, EUR, r)).toBeNull()
    expect(priceChange(NATIVE, NATIVE, r)).toBeNull()
  })
})

describe('query', () => {
  it('asks for ton + jettons and all currencies once', () => {
    const q = ratesQuery([NATIVE, USDT, USD, USDT])
    expect(q.tokens).toBe(`ton,${USDT.address}`)
    expect(q.currencies.startsWith('ton,usd,eur')).toBe(true)
  })
})
