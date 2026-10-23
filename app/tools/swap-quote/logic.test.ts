import { describe, expect, it } from 'vitest'
import { NATIVE, POPULAR } from '~/lib/prices-defi/assets'
import type { SwapCoffeeRoute } from '~/lib/prices-defi/swapcoffee'
import { applySlippage, cpmmOut, dedustPlanBody, dedustQuote, dedustReprice, rankQuotes, shortfall, stonfiQuote, stonfiSimulateUrl, swapCoffeeQuote } from './logic'
import type { DedustHop, StonfiSimulation } from './logic'
// All fixtures are real API answers captured on 2026-10-23 ~07:05 UTC for 10 GRAM -> USD₮ (and 1M NOT -> USD₮ on DeDust).
import sim from './fixture-stonfi-sim-ton-usdt.json' // POST api.ston.fi/v1/swap/simulate
import planTonUsdt from './fixture-dedust-plan-ton-usdt.json' // POST api.dedust.io/v2/routing/plan
import planNotUsdt from './fixture-dedust-plan-not-usdt.json'
import scRoute from './fixture-swapcoffee-route-ton-usdt.json' // POST backend.swap.coffee/v1/route

const USDT = POPULAR.find(a => a.symbol === 'USD₮')!
const NOT = POPULAR.find(a => a.symbol === 'NOT')!
const TEN = 10_000_000_000n

describe('cpmmOut (DeDust volatile pool math)', () => {
  it('reproduces the DeDust API amountOut and tradeFee exactly for every hop', () => {
    for (const plan of [planTonUsdt, planNotUsdt] as DedustHop[][][]) {
      for (const h of plan[0]!) {
        const inIdx = h.pool.assets.indexOf(h.assetIn)
        // On-chain get_trade_fee: GRAM/USD₮ pool 10/10000 (tonapi), NOT/GRAM pool 25/10000 (2.5e12 fee on 1e15 in).
        const feeNum = h.pool.address.startsWith('EQA-X') ? 10n : 25n
        const r = cpmmOut(BigInt(h.amountIn), BigInt(h.pool.reserves[inIdx]!), BigInt(h.pool.reserves[1 - inIdx]!), feeNum, 10000n)
        expect(r.fee.toString()).toBe(h.tradeFee)
        expect(r.out.toString()).toBe(h.amountOut)
      }
    }
  })
  it('returns 0 for empty pools or zero input', () => {
    expect(cpmmOut(0n, 1n, 1n, 1n, 100n).out).toBe(0n)
    expect(cpmmOut(5n, 0n, 1n, 1n, 100n).out).toBe(0n)
  })
})

describe('DeDust re-pricing with live reserves', () => {
  // tonapi /v2/blockchain/accounts/EQA-X_yo…/methods/get_reserves and get_trade_fee at 07:07 UTC:
  // reserve0 204916264019450 (GRAM), reserve1 271309044936 (USD₮), fee 10/10000.
  const live = [{ reserves: [204916264019450n, 271309044936n] as [bigint, bigint], feeNum: 10n, feeDen: 10000n }]
  const hops = (planTonUsdt as DedustHop[][])[0]!

  it('flags the API quote as stale when on-chain reserves moved', () => {
    const r = dedustReprice(hops, live, TEN)
    expect(r.out).toBe(cpmmOut(TEN, 204916264019450n, 271309044936n, 10n, 10000n).out)
    expect(Number(r.out) / 1e6).toBeCloseTo(13.22, 1) // ~1.32 USD per GRAM, like STON.fi's 13.234
    expect(r.stale!).toBeGreaterThan(0.05) // API said 14.63 from old reserves
    expect(r.impact).toBeGreaterThan(0)
    expect(r.impact).toBeLessThan(0.001)
  })

  it('builds a quote with min received and a warning', () => {
    const q = dedustQuote(hops, live, NATIVE, USDT, TEN, 0.01, a => (a === 'native' ? 'GRAM' : 'USD₮'))
    expect(q.minOut).toBe(applySlippage(q.out, 0.01))
    expect(q.route).toBe('GRAM → USD₮ · DeDust pool')
    expect(q.warnings.join(' ')).toMatch(/outdated reserves/)
    expect(q.link).toBe(`https://dedust.io/swap/TON/${USDT.address}`)
  })

  it('plan body uses DeDust asset ids', () => {
    expect(dedustPlanBody(NOT, USDT, 1n)).toEqual({
      from: 'jetton:0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc',
      to: 'jetton:0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe',
      amount: '1'
    })
  })
})

describe('STON.fi', () => {
  it('maps the simulate answer', () => {
    const q = stonfiQuote(sim as StonfiSimulation, NATIVE, USDT, TEN)
    expect(q.out).toBe(13234357n)
    expect(q.minOut).toBe(13102013n) // = STON.fi's own min_ask_units at 1%
    expect(applySlippage(13234357n, 0.01)).toBe(13102013n)
    expect(q.fee).toBe('0.30% (in USD₮)')
    expect(q.gas).toBe(185000000n)
    expect(q.route).toContain('STON.fi v1')
    expect(q.link).toBe(`https://app.ston.fi/swap?ft=TON&tt=${USDT.address}&fa=10`)
  })
  it('simulate URL uses the zero address for GRAM', () => {
    expect(stonfiSimulateUrl(NATIVE, USDT, TEN, 0.01)).toBe(`https://api.ston.fi/v1/swap/simulate?offer_address=EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c&ask_address=${USDT.address}&units=10000000000&slippage_tolerance=0.01`)
  })
})

describe('swap.coffee and ranking', () => {
  const sc = swapCoffeeQuote(scRoute as SwapCoffeeRoute, NATIVE, USDT, 0.01)
  it('maps the route', () => {
    expect(sc.out).toBe(13234357n) // 13.234357309608813 truncated to 6 decimals; same pool as STON.fi's answer
    expect(sc.route).toBe('GRAM → USDT via STON.fi v1')
    expect(sc.gas).toBe(185000000n)
  })
  it('ranks by output and reports the shortfall', () => {
    const dd = { ...sc, source: 'DeDust' as const, out: 13220000n }
    const ranked = rankQuotes([dd, sc])
    expect(ranked[0]!.source).toBe('swap.coffee')
    expect(shortfall(dd, ranked[0]!)).toBeCloseTo((13234357 - 13220000) / 13234357, 9)
  })
})
