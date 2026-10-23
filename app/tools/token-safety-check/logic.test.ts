import { describe, expect, it } from 'vitest'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import fx from './fixtures.json'
import { concentration, type DexPairs, type Holders, liquidity, metadataHome, riskOf, supplyLabel, type TcMasters, type TokenInput, tokenChecks } from './logic'

// fixtures.json: real tonapi, toncenter and DexScreener responses for NOT, a blacklisted airdrop token and USD₮ (see _source).
const input = (k: 'not' | 'scam'): TokenInput => ({
  jetton: fx[k].jetton as unknown as TonapiJetton,
  holders: fx[k].holders as unknown as Holders,
  master: fx[k].master as unknown as TcMasters,
  dex: fx[k].dex as unknown as DexPairs
})
const titles = (i: TokenInput) => tokenChecks(i).map(c => `${c.level}: ${c.title}`)
const NOT_RAW = '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc'

describe('Notcoin (verified, admin renounced)', () => {
  it('largest wallet holds 18,000,000,000 of 102,452,655,868 NOT = 17.6%', () => {
    const c = concentration(fx.not.holders as unknown as Holders, fx.not.jetton.total_supply)!
    expect(c.topWallet).toBeCloseTo(18_000_000_000 / 102_452_655_868.34, 4)
    expect(c.top10Wallets).toBeGreaterThan(c.topWallet)
  })
  it('liquidity sums only pools containing NOT', () => {
    const l = liquidity(fx.not.dex as unknown as DexPairs, NOT_RAW)!
    expect(l.pools).toBe(19)
    expect(l.top[0]).toEqual({ dex: 'stonfi', pair: 'NOT/GRAM', usd: 159483.19 })
    expect(l.usd).toBeGreaterThan(300_000)
  })
  it('checks and low risk', () => {
    const t = titles(input('not'))
    expect(t).toContain('ok: This token is verified by tonapi / Tonkeeper')
    expect(t).toContain('ok: Admin renounced')
    expect(t).toContain('ok: Common jetton wallet code')
    expect(t).toContain('info: Name and logo hosted on cdn.joincommunity.xyz')
    expect(t.some(x => x.startsWith('ok: Largest wallet holds 17.6% of the supply'))).toBe(true)
    expect(riskOf(tokenChecks(input('not')))).toBe('low')
  })
})

describe('blacklisted "GRAM AIRDROP" token', () => {
  it('high risk: scam list, link in symbol, admin wallet, mintable, no pool', () => {
    const t = titles(input('scam'))
    expect(t).toContain('danger: This token is on the tonapi / Tonkeeper scam list')
    expect(t).toContain('danger: Name or description contains a website or Telegram link')
    expect(t).toContain('warn: A single wallet is the admin')
    expect(t).toContain('warn: Supply can still grow')
    expect(t).toContain('danger: No DEX pool found')
    expect(t).toContain('warn: Uncommon jetton wallet code')
    expect(t).toContain('ok: Name and logo stored on-chain')
    expect(riskOf(tokenChecks(input('scam')))).toBe('high')
  })
})

describe('USD₮', () => {
  it('admin is a multisig, metadata on tether.to', () => {
    const t = titles({ jetton: fx.usdt.jetton as unknown as TonapiJetton, master: fx.usdt.master as unknown as TcMasters, holders: fx.usdt.holders as unknown as Holders, dex: null })
    // tether-treasury.ton holds most of the supply: normal for the verified issuer, not a red flag
    expect(t.some(x => /^info: One wallet holds \d+\.\d% of the supply \(tether-treasury\.ton\)$/.test(x))).toBe(true)
    expect(riskOf(tokenChecks({ jetton: fx.usdt.jetton as unknown as TonapiJetton, master: fx.usdt.master as unknown as TcMasters, holders: fx.usdt.holders as unknown as Holders, dex: null }))).toBe('low')
    expect(t).toContain('info: Admin is a multisig wallet')
    expect(t).toContain('info: Name and logo hosted on tether.to')
    expect(t).toContain('ok: Common jetton wallet code')
    expect(supplyLabel(fx.usdt.jetton as unknown as TonapiJetton)).toBe('1,429,976,002.51 USD₮')
  })
})

describe('metadataHome', () => {
  it('classifies the jetton_content forms', () => {
    expect(metadataHome({ decimals: '9', name: 'x' })).toEqual({ kind: 'onchain' })
    // BOLT's real uri from toncenter jetton/masters
    expect(metadataHome({ uri: 'ipfs://bafkreiast4fqlkp4upyu2cvo7fn7aabjusx765yzvq' })?.kind).toBe('ipfs')
    expect(metadataHome({ uri: 'https://tether.to/usdt-ton.json' })).toEqual({ kind: 'web', uri: 'https://tether.to/usdt-ton.json', host: 'tether.to' })
  })
})
