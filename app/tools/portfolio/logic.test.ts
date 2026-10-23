import { describe, expect, it } from 'vitest'
import type { TonapiJettonBalance } from '~/lib/accounts/core'
import { buildPortfolio, stakedNano } from './logic'

// All inputs are real mainnet data fetched 2026-10-22; expected sums computed independently in Python.
// GRAM rate: tonapi /v2/rates?tokens=ton&currencies=usd.
const TON_RATE = { price: 1.3258057, diff24h: -2.51, diff7d: -3.72, diff30d: -8.68 }

// A: TON Foundation (OLD), toncenter walletStates balance.
const A = { raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8', label: 'TF', nano: 1592542221079555n, jettons: [], staking: [] }
// B: tsTON holder, balance 0; tonapi /accounts/0:9E5D…E242/jettons?currencies=usd (trimmed) + one blacklisted token.
const B_JETTONS: TonapiJettonBalance[] = [
  { balance: '9387534613', price: { prices: { USD: 1.5512240977928946 }, diff_24h: { USD: '−2.81%' } }, jetton: { address: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', name: 'Tonstakers TON', symbol: 'tsTON', decimals: 9, verification: 'whitelist' } },
  { balance: '100489000000000', price: { prices: { USD: 0 }, diff_24h: { USD: '0.00%' } }, jetton: { address: '0:1abf14ddfff4aad90408b195446386e80a87f5f243e9fe5e814afd929440b792', name: 'Monkey on TON', symbol: 'MONKEY', decimals: 9, verification: 'none' } },
  { balance: '25918000000000', price: { prices: { USD: 3.1109746725378824e-06 }, diff_24h: { USD: '−3.84%' } }, jetton: { address: '0:91864bf1896f4c978e052d3c4678fb35c4ca8101ff9ac5a90180211f23c6301d', name: 'Tonoreum', symbol: 'TOR', decimals: 9, verification: 'whitelist' } },
  { balance: '0', price: { prices: { USD: 0.00038719127122337373 } }, jetton: { address: '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc', name: 'Notcoin', symbol: 'NOT', decimals: 9, verification: 'whitelist' } },
  { balance: '1000000000', price: { prices: { USD: 0 } }, jetton: { address: '0:749ed6c9ecda14f077203687f24327e609bc959decff92b36166f4097e8d9183', name: 'Nova BIT', symbol: 'NVB', decimals: 9, verification: 'blacklist' } }
]
const B = { raw: '0:9e5de3ae2cffbec44aea7f2d93a95f7b7d438cc81fd0b51c6dc7166350a3e242', label: 'B', nano: 0n, jettons: B_JETTONS, staking: [] }
// C: Tonkeeper Queue #1 nominator; tonapi /staking/nominator/0:2DC3…3029/pools, toncenter balance.
const POOL = '0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a'
const C = { raw: '0:2dc3ac43709284f71a18f4a7b54f912e6ca21aba0a40c373807cbd86098f3029', label: 'C', nano: 136411543654n, jettons: [], staking: [{ pool: POOL, amount: 1786399876112, pending_deposit: 999800000000, pending_withdraw: 0, ready_withdraw: 0 }] }

describe('stakedNano', () => {
  it('counts active stake, pending deposit and claimable withdrawal', () => {
    expect(stakedNano(C.staking[0]!)).toBe(2786199876112n)
    // second real nominator of the same pool. Assumption: pending_withdraw is part of the member balance
    // (opentonapi maps amount = Whales MemberBalance), so it is not added again.
    expect(stakedNano({ pool: POOL, amount: 79824594229, pending_deposit: 0, pending_withdraw: 25000000000, ready_withdraw: 0 })).toBe(79824594229n)
  })
})

describe('buildPortfolio', () => {
  const p = buildPortfolio([A, B, C], TON_RATE, 'USD', { poolNames: { [POOL]: 'Tonkeeper Queue #1' } })

  it('merges GRAM across accounts and lists staking and verified jettons by value', () => {
    expect(p.rows.map(r => `${r.kind}:${r.symbol}`)).toEqual(['coin:GRAM', 'staked:GRAM', 'jetton:tsTON', 'jetton:TOR'])
    expect(p.rows[0]).toMatchObject({ units: 1592678632623209n, holders: 2 })
    expect(p.rows[0]!.value).toBeCloseTo(2111582.4094000566, 4)
    expect(p.rows[1]).toMatchObject({ name: 'Staked in Tonkeeper Queue #1', units: 2786199876112n })
    expect(p.rows[1]!.value).toBeCloseTo(3693.9596770885837, 6)
  })
  it('keeps unverified tokens apart and hides scam tokens', () => {
    expect(p.unverified.map(r => r.symbol)).toEqual(['MONKEY'])
    expect(p.scam).toBe(1)
  })
  it('totals and weights the price change', () => {
    expect(p.total).toBeCloseTo(2115291.011877297, 4)
    expect(p.change['24h']).toBeCloseTo(-2.510002123044608, 9)
    // 7d: jettons have no 7d diff in the fixture, so only GRAM rows count
    expect(p.change['7d']).toBeCloseTo(-3.72, 9)
  })
  it('breaks down per account', () => {
    expect(p.perAccount.map(a => a.label)).toEqual(['TF', 'B', 'C'])
    expect(p.perAccount[0]!.total).toBeCloseTo(2111401.5541979345, 4)
    expect(p.perAccount[1]!.tokens).toBeCloseTo(14.642800152113331, 9)
    expect(p.perAccount[2]!.coin).toBeCloseTo(180.85520212227206, 6)
    expect(p.perAccount[2]!.staked).toBeCloseTo(3693.9596770885837, 6)
  })
  it('works without a price (testnet)', () => {
    const t = buildPortfolio([A], undefined, 'USD')
    expect(t.total).toBe(0)
    expect(t.rows[0]!.value).toBeUndefined()
    expect(t.change['24h']).toBeUndefined()
  })
})
