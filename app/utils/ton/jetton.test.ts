import { describe, expect, it } from 'vitest'
import { formatJettonAmount, jettonDecimals, KNOWN_JETTONS, parseJettonAmount } from './jetton'

// USDT on TON has 6 decimals (toncenter v3 /jetton/masters: jetton_content.decimals "6"),
// so the on-chain transfer of 492135 units (tx PnZsfaNVbVlQ…) is 0.492135 USD₮.
describe('jetton amounts', () => {
  it('formats with the jetton decimals', () => {
    expect(formatJettonAmount(492135n, 6, { symbol: 'USD₮' })).toBe('0.492135 USD₮')
    expect(formatJettonAmount(2501000000n, 6)).toBe('2,501')
    expect(formatJettonAmount(1_234_567_891n, 9, { maxDecimals: 2 })).toBe('1.23')
  })

  it('parses exactly', () => {
    expect(parseJettonAmount('0.492135', 6)).toBe(492135n)
    expect(() => parseJettonAmount('0.0000001', 6)).toThrow(/6 decimal/)
  })

  it('reads decimals from metadata with the TEP-64 default of 9', () => {
    expect(jettonDecimals({ decimals: '6' })).toBe(6)
    expect(jettonDecimals({})).toBe(9)
    expect(jettonDecimals(null)).toBe(9)
    expect(jettonDecimals({ decimals: 'x' })).toBe(9)
  })

  it('known jettons have unique masters', () => {
    expect(new Set(KNOWN_JETTONS.map(j => j.master)).size).toBe(KNOWN_JETTONS.length)
  })
})
