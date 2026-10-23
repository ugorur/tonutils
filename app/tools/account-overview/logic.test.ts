import { describe, expect, it } from 'vitest'
import type { TonapiJettonBalance } from '~/lib/accounts/core'
import { classifyQuery, countLabel, summarizeJettons } from './logic'

// tonapi /v2/accounts/0:9E5DE3AE…E242/jettons?currencies=usd (2026-10-22), trimmed, plus one
// blacklisted balance from 0:66cd6e30…1640 (Nova BIT, tonapi verification "blacklist").
const BALANCES: TonapiJettonBalance[] = [
  { balance: '9387534613', price: { prices: { USD: 1.5512240977928946 }, diff_24h: { USD: '−2.81%' } }, jetton: { address: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', name: 'Tonstakers TON', symbol: 'tsTON', decimals: 9, verification: 'whitelist' } },
  { balance: '100489000000000', price: { prices: { USD: 0 }, diff_24h: { USD: '0.00%' } }, jetton: { address: '0:1abf14ddfff4aad90408b195446386e80a87f5f243e9fe5e814afd929440b792', name: 'Monkey on TON', symbol: 'MONKEY', decimals: 9, verification: 'none' } },
  { balance: '25918000000000', price: { prices: { USD: 3.1109746725378824e-06 }, diff_24h: { USD: '−3.84%' } }, jetton: { address: '0:91864bf1896f4c978e052d3c4678fb35c4ca8101ff9ac5a90180211f23c6301d', name: 'Tonoreum', symbol: 'TOR', decimals: 9, verification: 'whitelist' } },
  { balance: '0', price: { prices: { USD: 0.00038719127122337373 }, diff_24h: { USD: '−6.33%' } }, jetton: { address: '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc', name: 'Notcoin', symbol: 'NOT', decimals: 9, verification: 'whitelist' } },
  { balance: '1000000000', price: { prices: { USD: 0 } }, jetton: { address: '0:749ed6c9ecda14f077203687f24327e609bc959decff92b36166f4097e8d9183', name: 'Nova BIT', symbol: 'NVB', decimals: 9, verification: 'blacklist' } }
]

describe('classifyQuery', () => {
  it('accepts addresses in any form and names', () => {
    expect(classifyQuery('  EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N ')).toEqual({ kind: 'address', raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8' })
    expect(classifyQuery('Foundation.ton')).toEqual({ kind: 'domain', name: 'foundation.ton' })
    expect(classifyQuery('alice.t.me')).toEqual({ kind: 'domain', name: 'alice.t.me' })
    expect(classifyQuery('')).toEqual({ kind: 'empty' })
    expect(classifyQuery('vitalik.eth')).toMatchObject({ kind: 'invalid', error: expect.stringMatching(/\.ton and \.t\.me/) })
    expect(classifyQuery('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2X')).toMatchObject({ kind: 'invalid' })
  })
})

describe('summarizeJettons', () => {
  it('counts non-zero holdings, drops scam tokens and sums priced value', () => {
    const s = summarizeJettons(BALANCES, 'usd')
    expect(s.count).toBe(3)
    expect(s.scam).toBe(1)
    // 9.387534613 * 1.5512240977928946 + 25918 * 3.1109746725378824e-06 (Python)
    expect(s.value).toBeCloseTo(14.642800152113331, 9)
    expect(s.top.map(h => h.symbol)).toEqual(['tsTON', 'TOR', 'MONKEY'])
    expect(s.top[0]).toMatchObject({ units: 9387534613n, decimals: 9, rate: { price: 1.5512240977928946, diff24h: -2.81 } })
    expect(s.top[2]!.value).toBeUndefined()
  })
})

describe('countLabel', () => {
  it('marks a full page', () => {
    expect(countLabel(3, 101)).toBe('3')
    expect(countLabel(101, 101)).toBe('100+')
  })
})

describe('summarizeJettons with an unverified priced token', () => {
  it('lists it after verified ones and leaves it out of the total', () => {
    // MONKEY (verification "none") given a price to model a self-listed token
    const fake = BALANCES.map(b => b.jetton.symbol === 'MONKEY' ? { ...b, price: { prices: { USD: 0.001 } } } : b)
    const s = summarizeJettons(fake, 'USD')
    expect(s.top.map(h => h.symbol)).toEqual(['tsTON', 'TOR', 'MONKEY'])
    expect(s.top[2]!.value).toBeCloseTo(100489 * 0.001, 9)
    expect(s.value).toBeCloseTo(14.642800152113331, 9)
  })
})

describe('summarizeJettons on a full tonapi page', () => {
  it('marks the counts as lower bounds', () => {
    // tonapi /v2/accounts/0:f99b…f9c4/jettons (Binance deposit wallet) returned exactly 1000 balances on 2026-10-23.
    const full = Array.from({ length: 1000 }, (_, i) => BALANCES[i % BALANCES.length]!)
    expect(summarizeJettons(full, 'USD').capped).toBe(true)
    expect(summarizeJettons(BALANCES, 'USD').capped).toBe(false)
  })
})
