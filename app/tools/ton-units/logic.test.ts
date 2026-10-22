import { describe, expect, it } from 'vitest'
import { nanoToTon, tonToNano } from './logic'

describe('tonToNano', () => {
  it.each([
    ['1', 1_000_000_000n],
    ['0.05', 50_000_000n],
    ['0.000000001', 1n],
    ['1,234.5', 1_234_500_000_000n],
    // above Number.MAX_SAFE_INTEGER nano: float math would lose digits here
    ['9007199.254740993', 9_007_199_254_740_993n]
  ])('%s TON = %s nano', (ton, nano) => {
    expect(tonToNano(ton).nano).toBe(nano)
  })

  it('formats both sides', () => {
    expect(tonToNano('1234567.5')).toEqual({
      nano: 1_234_567_500_000_000n,
      ton: '1234567.5',
      tonFormatted: '1,234,567.5',
      nanoFormatted: '1,234,567,500,000,000'
    })
  })

  it('rejects sub-nano precision', () => {
    expect(() => tonToNano('0.0000000001')).toThrow(/9 decimal/)
  })
})

describe('nanoToTon', () => {
  it.each([
    ['1000000000', '1'],
    ['1', '0.000000001'],
    ['1_500_000_000', '1.5'],
    ['-250000000', '-0.25'],
    ['5000000000000000000', '5000000000']
  ])('%s nano = %s TON', (nano, ton) => {
    expect(nanoToTon(nano).ton).toBe(ton)
  })

  it.each(['1.5', 'abc', ''])('rejects %j', (input) => {
    expect(() => nanoToTon(input)).toThrow()
  })
})
