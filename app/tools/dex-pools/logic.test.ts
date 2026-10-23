import { describe, expect, it } from 'vitest'
import { csvRows, dedustFeePct, dexLabel, poolAppUrl, searchUrl, stonfiPoolInfo, tonPairs } from './logic'
import type { DexPair, StonfiPool } from './logic'
// Real answers captured 2026-10-23:
import notPairs from './fixture-dexscreener-not.json' // api.dexscreener.com/latest/dex/tokens/<NOT master>
import dogsSearch from './fixture-dexscreener-search-dogs.json' // api.dexscreener.com/latest/dex/search?q=DOGS
import stonPool from './fixture-stonfi-pool.json' // api.ston.fi/v1/pools/EQCaY8Ifl2S6lRBMBJeY35LIuMXPc8JfItWG4tl7lBGrSoR2
import dedustPool from './fixture-dedust-pool.json' // tonapi /v2/blockchain/accounts/EQCUhn…eZER/methods/{get_assets,get_reserves,get_trade_fee}

const NOT = 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT'

describe('searchUrl', () => {
  it('address -> token pairs, text -> search', () => {
    expect(searchUrl(NOT)).toBe(`https://api.dexscreener.com/latest/dex/tokens/${NOT}`)
    expect(searchUrl('0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc')).toBe(`https://api.dexscreener.com/latest/dex/tokens/${NOT}`)
    expect(searchUrl(' dogs ')).toBe('https://api.dexscreener.com/latest/dex/search?q=dogs')
    expect(searchUrl('USD₮')).toBe('https://api.dexscreener.com/latest/dex/search?q=USD%E2%82%AE')
  })
})

describe('tonPairs', () => {
  it('keeps only TON pairs, deepest liquidity first', () => {
    const search = tonPairs(dogsSearch.pairs as DexPair[])
    expect(search.length).toBe(dogsSearch.pairs.filter(p => p.chainId === 'ton').length)
    expect(search.length).toBeLessThan(dogsSearch.pairs.length) // search spans other chains
    const pairs = tonPairs(notPairs.pairs as DexPair[])
    for (let i = 1; i < pairs.length; i++) expect(pairs[i - 1]!.liquidity!.usd!).toBeGreaterThanOrEqual(pairs[i]!.liquidity!.usd!)
    expect(new Set(pairs.map(p => dexLabel(p.dexId)))).toEqual(new Set(['STON.fi', 'DeDust']))
    expect(tonPairs(null)).toEqual([])
  })

  it('DexScreener reserves of the DeDust NOT/GRAM pool match the pool contract (get_reserves)', () => {
    const p = (notPairs.pairs as DexPair[]).find(x => x.pairAddress === 'EQCUhnOllvxtLDEj3_9k0yMeTQ4Wv6rFBtXr2wnzKzucZeER')!
    // get_assets: asset0 native (GRAM, 9 dec), asset1 NOT (9 dec).
    expect(dedustPool.get_assets.decoded.asset0.sum_type).toBe('Native')
    expect(p.liquidity!.quote).toBeCloseTo(Number(dedustPool.get_reserves.decoded.reserve0) / 1e9, 2)
    expect(p.liquidity!.base! / (Number(dedustPool.get_reserves.decoded.reserve1) / 1e9)).toBeCloseTo(1, 6)
  })
})

describe('pool details', () => {
  it('STON.fi fees are basis points; APY fractions become percent', () => {
    const info = stonfiPoolInfo(stonPool.pool as StonfiPool)
    expect(info.version).toBe('v1')
    expect(info.lpFee).toBe(0.7)
    expect(info.protocolFee).toBe(0.3)
    expect(info.totalFee).toBe(1)
    expect(info.apy.d7).toBeCloseTo(Number(stonPool.pool.apy_7d) * 100, 9)
    expect(info.tvlUsd).toBe(Number(stonPool.pool.lp_total_supply_usd))
    expect(info.router).toBe('EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt')
  })
  it('STON.fi total fee matches what swap/simulate charged on the v1 GRAM/USD₮ pool (20 + 10 bps = 0.3%)', () => {
    // api.ston.fi/v1/pools/by_market: lp_fee "20", protocol_fee "10"; simulate fee_percent 0.003004015.
    expect(stonfiPoolInfo({ ...(stonPool.pool as StonfiPool), lp_fee: '20', protocol_fee: '10' }).totalFee).toBe(0.3) // not 0.30000000000000004
  })
  it('DeDust trade fee from get_trade_fee', () => {
    expect(dedustFeePct(dedustPool.get_trade_fee.decoded)).toBe(0.25)
  })
  it('links and CSV', () => {
    const p = tonPairs(notPairs.pairs as DexPair[])[0]!
    expect(poolAppUrl(p)).toBe(`https://app.ston.fi/pools/${p.pairAddress}`)
    expect(poolAppUrl({ ...p, dexId: 'other' })).toBeNull()
    expect(csvRows([p])[0]).toMatchObject({ dex: 'STON.fi', pair: 'NOT/GRAM', pool: p.pairAddress })
  })
})
