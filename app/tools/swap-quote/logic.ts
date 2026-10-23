// Swap quotes from STON.fi (official simulate API), DeDust (route from its API, re-priced with live
// on-chain reserves because the API's reserves can lag the chain) and the swap.coffee aggregator.
import type { Asset } from '~/lib/prices-defi/assets'
import { applySlippage, ids } from '~/lib/prices-defi/assets'
import type { SwapCoffeeRoute } from '~/lib/prices-defi/swapcoffee'
import { routeLabel, routeOutUnits } from '~/lib/prices-defi/swapcoffee'

export interface Quote {
  source: 'STON.fi' | 'DeDust' | 'swap.coffee'
  /** Expected output, base units of the ask token. */
  out: bigint
  /** After slippage tolerance. */
  minOut: bigint
  /** Fraction (0.01 = 1%), excluding fees, or null when unknown. */
  impact: number | null
  fee: string
  /** GRAM attached for gas, nano (most of it comes back as excess). */
  gas: bigint | null
  route: string
  warnings: string[]
  /** Where to do this swap. */
  link: string
}

export { applySlippage }

// ---------------------------------------------------------------- STON.fi

/** POST https://api.ston.fi/v1/swap/simulate response (fields we use). */
export interface StonfiSimulation {
  ask_units: string
  min_ask_units: string
  price_impact: string
  fee_units: string
  fee_percent: string
  pool_address: string
  router?: { major_version: number, minor_version: number }
  gas_params?: { forward_gas?: string, estimated_gas_consumption?: string }
}

export function stonfiSimulateUrl(from: Asset, to: Asset, units: bigint, slippage: number): string {
  const q = new URLSearchParams({ offer_address: ids.stonfi(from), ask_address: ids.stonfi(to), units: units.toString(), slippage_tolerance: String(slippage) })
  return `https://api.ston.fi/v1/swap/simulate?${q}`
}

export function stonfiQuote(sim: StonfiSimulation, from: Asset, to: Asset, units: bigint): Quote {
  const fwd = sim.gas_params?.forward_gas ? BigInt(sim.gas_params.forward_gas) : 0n
  const version = sim.router ? `v${sim.router.major_version}` : ''
  const amount = (Number(units) / 10 ** from.decimals).toString()
  return {
    source: 'STON.fi',
    out: BigInt(sim.ask_units),
    minOut: BigInt(sim.min_ask_units),
    impact: Number(sim.price_impact),
    fee: `${(Number(sim.fee_percent) * 100).toFixed(2)}% (in ${to.symbol})`,
    // Jetton offers attach forward gas + ~0.05 for the transfer; GRAM offers attach forward gas on top of the amount.
    gas: fwd ? fwd + (from.kind === 'native' ? 0n : 50_000_000n) : null,
    route: `${from.symbol} → ${to.symbol} · STON.fi ${version} pool`.trim(),
    warnings: [],
    link: `https://app.ston.fi/swap?ft=${ids.app(from)}&tt=${ids.app(to)}&fa=${amount}`
  }
}

// ---------------------------------------------------------------- DeDust

/** One hop of POST https://api.dedust.io/v2/routing/plan. The API answers [[hop, hop…]] (best route first). */
export interface DedustHop {
  pool: { address: string, isStable: boolean, assets: string[], reserves: string[] }
  assetIn: string
  assetOut: string
  tradeFee: string
  amountIn: string
  amountOut: string
}

export function dedustPlanBody(from: Asset, to: Asset, units: bigint) {
  return { from: ids.dedust(from), to: ids.dedust(to), amount: units.toString() }
}

/**
 * DeDust volatile pool: the trade fee is taken from the input, then x*y=k.
 * Matches the DeDust API's own amountOut exactly for the same reserves.
 */
export function cpmmOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeNum: bigint, feeDen: bigint): { out: bigint, fee: bigint } {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return { out: 0n, fee: 0n }
  const fee = amountIn * feeNum / feeDen
  const x = amountIn - fee
  return { out: x * reserveOut / (reserveIn + x), fee }
}

export interface LivePool {
  /** Reserves in the order of pool.assets (tonapi get_reserves). */
  reserves: [bigint, bigint]
  /** tonapi get_trade_fee. */
  feeNum: bigint
  feeDen: bigint
}

/** Re-run the planned route on live reserves. Stable-swap hops keep the API figure (curve math differs). */
export function dedustReprice(hops: DedustHop[], live: LivePool[], units: bigint): { out: bigint, impact: number, stale: number | null, stable: boolean } {
  let amount = units
  let ideal = Number(units)
  let stable = false
  hops.forEach((h, i) => {
    const l = live[i]!
    const inIdx = h.pool.assets.indexOf(h.assetIn)
    const rIn = l.reserves[inIdx]!
    const rOut = l.reserves[1 - inIdx]!
    if (h.pool.isStable) {
      stable = true
      // Scale the API's hop output to our input amount.
      amount = BigInt(h.amountOut) * amount / BigInt(h.amountIn)
      ideal *= Number(h.amountOut) / Number(h.amountIn)
      return
    }
    const feeRate = Number(l.feeNum) / Number(l.feeDen)
    ideal *= (1 - feeRate) * Number(rOut) / Number(rIn)
    amount = cpmmOut(amount, rIn, rOut, l.feeNum, l.feeDen).out
  })
  const apiOut = BigInt(hops.at(-1)!.amountOut)
  return {
    out: amount,
    impact: ideal > 0 ? Math.max(0, 1 - Number(amount) / ideal) : 0,
    // How far the API's quote is from the live one (positive = API too optimistic).
    stale: amount > 0n ? Number(apiOut) / Number(amount) - 1 : null,
    stable
  }
}

export function dedustQuote(hops: DedustHop[], live: LivePool[], from: Asset, to: Asset, units: bigint, slippage: number, symbols: (asset: string) => string): Quote {
  const r = dedustReprice(hops, live, units)
  const warnings: string[] = []
  if (r.stable) warnings.push('Route uses a stable-swap pool; that hop uses the DeDust API figure.')
  if (r.stale !== null && Math.abs(r.stale) > 0.005) warnings.push(`DeDust's API quoted ${(r.stale * 100).toFixed(1)}% ${r.stale > 0 ? 'more' : 'less'} from outdated reserves; this quote uses live on-chain reserves.`)
  const fees = live.map(l => `${(Number(l.feeNum) / Number(l.feeDen) * 100).toFixed(2)}%`)
  const path = [hops[0]!.assetIn, ...hops.map(h => h.assetOut)].map(symbols)
  return {
    source: 'DeDust',
    out: r.out,
    minOut: applySlippage(r.out, slippage),
    impact: r.impact,
    fee: `${fees.join(' + ')} (in ${hops.length > 1 ? 'each hop\'s input' : from.symbol})`,
    // ponytail: typical DeDust SDK gas (0.2 GRAM native, 0.3 jetton); excess is returned.
    gas: from.kind === 'native' ? 200_000_000n : 300_000_000n,
    route: `${path.join(' → ')} · DeDust ${hops.length > 1 ? `${hops.length}-hop` : 'pool'}`,
    warnings,
    link: `https://dedust.io/swap/${ids.app(from)}/${ids.app(to)}`
  }
}

// ---------------------------------------------------------------- swap.coffee

export function swapCoffeeQuote(route: SwapCoffeeRoute, from: Asset, to: Asset, slippage: number): Quote {
  const out = routeOutUnits(route, to.decimals)
  const amount = route.input_amount.toString()
  return {
    source: 'swap.coffee',
    out,
    minOut: applySlippage(out, slippage),
    impact: route.price_impact === undefined ? null : Math.abs(route.price_impact),
    // swap.coffee's price_impact is measured against USD value, so it includes the DEX fee.
    fee: 'Included in the output and in the price impact',
    gas: route.recommended_gas ? BigInt(Math.round(route.recommended_gas * 1e9)) : null,
    route: routeLabel(route),
    warnings: [],
    link: `https://swap.coffee/dex?ft=${ids.app(from)}&st=${ids.app(to)}&fa=${amount}`
  }
}

/** Best (largest output) first. */
export function rankQuotes(quotes: Quote[]): Quote[] {
  return [...quotes].sort((a, b) => (b.out > a.out ? 1 : b.out < a.out ? -1 : 0))
}

/** How much less than the best quote, as a fraction. */
export function shortfall(q: Quote, best: Quote): number {
  return best.out > 0n ? Number(best.out - q.out) / Number(best.out) : 0
}
