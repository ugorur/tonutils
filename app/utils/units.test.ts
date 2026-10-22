import { describe, expect, it } from 'vitest'
import { formatUnits, groupThousands, parseUnits } from './units'

describe('parseUnits', () => {
  it.each([
    ['1', 1_000_000_000n],
    ['1.5', 1_500_000_000n],
    ['0.000000001', 1n],
    ['.5', 500_000_000n],
    ['5.', 5_000_000_000n],
    ['1,000.25', 1_000_250_000_000n],
    ['-0.1', -100_000_000n],
    ['5000000000', 5_000_000_000_000_000_000n]
  ])('%s TON -> %s nano', (input, nano) => {
    expect(parseUnits(input)).toBe(nano)
  })

  it('respects custom decimals', () => {
    expect(parseUnits('1.23', 6)).toBe(1_230_000n)
    expect(parseUnits('7', 0)).toBe(7n)
  })

  it.each(['', 'abc', '1.2.3', '.', '-', '1e9', '0.0000000001'])('rejects %j', (input) => {
    expect(() => parseUnits(input)).toThrow()
  })
})

describe('formatUnits', () => {
  it.each([
    [1_000_000_000n, '1'],
    [1_500_000_000n, '1.5'],
    [1n, '0.000000001'],
    [0n, '0'],
    [-100_000_000n, '-0.1'],
    [123_456_789_012_345_678_901_234_567n, '123456789012345678.901234567']
  ])('%s nano -> %s', (nano, out) => {
    expect(formatUnits(nano)).toBe(out)
  })

  it('round-trips', () => {
    for (const s of ['0.000000001', '42', '18446744073709551615.123456789']) {
      expect(formatUnits(parseUnits(s))).toBe(s)
    }
  })
})

describe('groupThousands', () => {
  it('groups the integer part only', () => {
    expect(groupThousands('1234567.123456')).toBe('1,234,567.123456')
    expect(groupThousands('-1234')).toBe('-1,234')
    expect(groupThousands('12')).toBe('12')
  })
})
