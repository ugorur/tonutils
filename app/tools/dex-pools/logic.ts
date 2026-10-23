// DEX pools for a token: list from DexScreener (STON.fi + DeDust pairs on TON, reserves read from chain),
// details from STON.fi's API (fees, APY) or the DeDust pool contract (trade fee via tonapi get-method).
import { isNativeAddress, normalizeMaster } from '~/lib/prices-defi/assets'

export interface DexToken { address: string, name: string, symbol: string }
export interface DexPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  labels?: string[]
  baseToken: DexToken
  quoteToken: DexToken
  priceNative?: string
  priceUsd?: string
  txns?: { h24?: { buys: number, sells: number } }
  volume?: { h24?: number }
  priceChange?: { h24?: number }
  liquidity?: { usd?: number, base?: number, quote?: number }
  fdv?: number
  marketCap?: number
  pairCreatedAt?: number
}

const API = 'https://api.dexscreener.com/latest/dex'

/** Jetton address -> all pairs of that token; anything else -> text search (all chains, filtered later). */
export function searchUrl(query: string): string {
  const q = query.trim()
  try {
    const master = isNativeAddress(q) ? 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c' : normalizeMaster(q)
    return `${API}/tokens/${master}`
  }
  catch {
    return `${API}/search?q=${encodeURIComponent(q)}`
  }
}

/** TON pairs only, deepest liquidity first. */
export function tonPairs(pairs: DexPair[] | null | undefined): DexPair[] {
  return (pairs ?? []).filter(p => p.chainId === 'ton').sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
}

const DEX_LABELS: Record<string, string> = { stonfi: 'STON.fi', dedust: 'DeDust' }
export const dexLabel = (id: string) => DEX_LABELS[id] ?? id

/** App page of the pool on its DEX, when we know the URL scheme. */
export function poolAppUrl(p: DexPair): string | null {
  if (p.dexId === 'stonfi') return `https://app.ston.fi/pools/${p.pairAddress}`
  if (p.dexId === 'dedust') return `https://dedust.io/pools/${p.pairAddress}`
  return null
}

/** GET https://api.ston.fi/v1/pools/{address} -> pool. Fee fields are basis points as strings. */
export interface StonfiPool {
  address: string
  router_address: string
  reserve0: string
  reserve1: string
  token0_address: string
  token1_address: string
  lp_fee: string
  protocol_fee: string
  ref_fee?: string
  lp_total_supply_usd?: string
  apy_1d?: string
  apy_7d?: string
  apy_30d?: string
  volume_24h_usd?: string
  deprecated: boolean
  tags?: string[]
}

export interface StonfiPoolInfo {
  version: string
  lpFee: number
  protocolFee: number
  /** What a swapper pays, percent. */
  totalFee: number
  apy: { d1: number | null, d7: number | null, d30: number | null }
  tvlUsd: number | null
  volumeUsd: number | null
  deprecated: boolean
  router: string
}

const num = (s?: string) => (s === undefined || s === '' || !Number.isFinite(Number(s)) ? null : Number(s))

export function stonfiPoolInfo(p: StonfiPool): StonfiPoolInfo {
  const lp = Number(p.lp_fee) / 100
  const protocol = Number(p.protocol_fee) / 100
  const v = p.tags?.find(t => t.startsWith('pool:dex_major_version:'))?.split(':').at(-1)
  const pct = (s?: string) => (num(s) === null ? null : num(s)! * 100)
  return {
    version: v ? `v${v}` : '',
    lpFee: lp,
    protocolFee: protocol,
    totalFee: Math.round((lp + protocol) * 1e4) / 1e4,
    apy: { d1: pct(p.apy_1d), d7: pct(p.apy_7d), d30: pct(p.apy_30d) },
    tvlUsd: num(p.lp_total_supply_usd),
    volumeUsd: num(p.volume_24h_usd),
    deprecated: p.deprecated,
    router: p.router_address
  }
}

/** tonapi .../methods/get_trade_fee decoded -> percent. */
export function dedustFeePct(decoded: { trade_fee_numerator: string, trade_fee_denominator: string }): number {
  return Number(decoded.trade_fee_numerator) / Number(decoded.trade_fee_denominator) * 100
}

export function csvRows(pairs: DexPair[]) {
  return pairs.map(p => ({
    dex: dexLabel(p.dexId),
    pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
    pool: p.pairAddress,
    price_usd: p.priceUsd ?? '',
    liquidity_usd: p.liquidity?.usd ?? '',
    volume_24h_usd: p.volume?.h24 ?? '',
    change_24h_pct: p.priceChange?.h24 ?? '',
    base_reserve: p.liquidity?.base ?? '',
    quote_reserve: p.liquidity?.quote ?? ''
  }))
}
