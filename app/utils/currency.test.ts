import { describe, expect, it } from 'vitest'
import { formatCoin } from './currency'

// 1 GRAM = 10^9 nano (TON whitepaper / docs.ton.org "nanotons" unit, unchanged by the rename).
describe('formatCoin', () => {
  it.each([
    [1_000_000_000n, {}, '1 GRAM'],
    [1n, {}, '0.000000001 GRAM'],
    [1_234_567_500_000_000n, {}, '1,234,567.5 GRAM'],
    [1_234_567_500_000_000n, { group: false, symbol: false }, '1234567.5'],
    [1_999_999_999n, { maxDecimals: 2 }, '1.99 GRAM'],
    [-1n, { maxDecimals: 2 }, '0 GRAM'],
    [-1_500_000_000n, {}, '-1.5 GRAM']
  ] as const)('%s %o -> %s', (nano, opts, out) => {
    expect(formatCoin(nano, opts)).toBe(out)
  })
})
