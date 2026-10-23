// LP positions on STON.fi and DeDust. LP tokens are jettons whose master is the pool, so a position is
// (LP balance ÷ LP total supply) × each reserve. Pure TS: network access comes in through `LpClients`.
import { Address } from '@ton/core'
import { COIN_SYMBOL } from '~/utils/currency'

export type Dex = 'stonfi' | 'dedust'

/** Native GRAM is 'native'; jettons are lowercase raw masters. */
export type TokenId = string

export interface Pool {
  /** Lowercase raw pool (= LP jetton master) address. */
  address: string
  dex: Dex
  /** "v1", "v2", "stable" … shown as a small tag. */
  variant: string
  tokens: [TokenId, TokenId]
  reserves: [bigint, bigint]
  lpSupply: bigint
  /** STON.fi only: 7-day APY as a fraction. */
  apy7d?: number
}

export interface FarmStake {
  /** Lowercase raw farm NFT. */
  nft: string
  status: string
  rewards: { token: TokenId, amount: bigint }[]
}

export interface Position {
  pool: Pool
  lp: bigint
  source: 'wallet' | 'farm'
  farm?: FarmStake
}

export interface TokenInfo {
  symbol: string
  decimals: number
  image?: string
}

export interface PositionView extends Position {
  share: number
  amounts: [bigint, bigint]
  /** USD, or null when a token has no price. */
  value: number | null
}

// ---------- pure helpers ----------

/** Raw lowercase; the all-zero basechain address (how STON.fi writes GRAM) becomes 'native'. */
export function tokenId(address: string): TokenId {
  const a = Address.parse(address)
  if (a.workChain === 0 && a.hash.every(b => b === 0)) return 'native'
  return a.toRawString().toLowerCase()
}

/** Pre-filter by name before asking the DEX APIs; the APIs then confirm (fake "LP" tokens get dropped). */
export function lpCandidate(j: { name?: string, symbol?: string }): Dex | null {
  const name = j.name ?? ''
  if (/^LP Token for /i.test(name) || /^STON\.fi .*LP/i.test(name)) return 'stonfi'
  if (/^DeDust (Stable )?Pool:/i.test(name)) return 'dedust'
  return null
}

/** Your part of each reserve: floor(reserve × lp ÷ supply), what a full withdrawal returns before fees. */
export function underlying(lp: bigint, supply: bigint, reserves: [bigint, bigint]): [bigint, bigint] {
  if (supply <= 0n) return [0n, 0n]
  return [reserves[0] * lp / supply, reserves[1] * lp / supply]
}

/** STON.fi API GET /v1/pools/{address} → pool. */
export interface StonfiPool {
  address: string
  reserve0: string
  reserve1: string
  token0_address: string
  token1_address: string
  lp_total_supply: string
  apy_7d?: string | null
  amp?: string | null
  tags?: string[]
}

export function fromStonfi(p: StonfiPool): Pool {
  const v2 = p.tags?.includes('pool:dex_major_version:2')
  const apy = Number(p.apy_7d)
  return {
    address: tokenId(p.address),
    dex: 'stonfi',
    variant: `${v2 ? 'v2' : 'v1'}${p.amp ? ' stable' : ''}`,
    tokens: [tokenId(p.token0_address), tokenId(p.token1_address)],
    reserves: [BigInt(p.reserve0), BigInt(p.reserve1)],
    lpSupply: BigInt(p.lp_total_supply),
    apy7d: Number.isFinite(apy) ? apy : undefined
  }
}

/** tonapi decoded DeDust asset (get_assets). */
export interface DedustAsset {
  sum_type: string
  jetton?: { workchain_id: number, address: string }
}

export function dedustToken(a: DedustAsset): TokenId {
  if (a.sum_type === 'Native') return 'native'
  if (a.sum_type === 'Jetton' && a.jetton) return `${a.jetton.workchain_id}:${a.jetton.address.toLowerCase()}`
  throw new Error(`Unsupported DeDust asset type ${a.sum_type}`)
}

export function fromDedust(address: string, name: string, lpSupply: string, reserves: { reserve0: string, reserve1: string }, assets: { asset0: DedustAsset, asset1: DedustAsset }): Pool {
  return {
    address: tokenId(address),
    dex: 'dedust',
    variant: /stable/i.test(name) ? 'stable' : 'volatile',
    tokens: [dedustToken(assets.asset0), dedustToken(assets.asset1)],
    reserves: [BigInt(reserves.reserve0), BigInt(reserves.reserve1)],
    lpSupply: BigInt(lpSupply)
  }
}

/** STON.fi API GET /v1/wallets/{address}/farms → farm_list item (fields used). */
export interface StonfiFarm {
  pool_address: string
  status: string
  nft_infos: { address: string, staked_tokens: string, status: string, rewards?: { address: string, amount: string }[] }[]
}

/** Farm NFTs still holding LP. Unstaked NFTs keep their old `staked_tokens`, so they are skipped. */
export function activeStakes(farms: StonfiFarm[]): { pool: string, lp: bigint, stake: FarmStake }[] {
  return farms.flatMap(f => f.nft_infos
    .filter(n => n.status !== 'unstaked' && BigInt(n.staked_tokens) > 0n)
    .map(n => ({
      pool: tokenId(f.pool_address),
      lp: BigInt(n.staked_tokens),
      stake: {
        nft: tokenId(n.address),
        status: n.status,
        rewards: (n.rewards ?? []).map(r => ({ token: tokenId(r.address), amount: BigInt(r.amount) })).filter(r => r.amount > 0n)
      }
    })))
}

export function view(p: Position, prices: Map<TokenId, number>, tokens: Map<TokenId, TokenInfo>): PositionView {
  const amounts = underlying(p.lp, p.pool.lpSupply, p.pool.reserves)
  const share = p.pool.lpSupply > 0n ? Number(p.lp * 10n ** 12n / p.pool.lpSupply) / 1e12 : 0
  let value: number | null = 0
  for (const i of [0, 1] as const) {
    const t = p.pool.tokens[i]
    const price = prices.get(t)
    const info = tokens.get(t)
    if (price === undefined || !info) value = null
    else if (value !== null) value += (Number(amounts[i]) / 10 ** info.decimals) * price
  }
  return { ...p, share, amounts, value }
}

/** tonapi /rates keys: "TON" or a friendly jetton address. */
export function pricesFromRates(rates: Record<string, { prices?: Record<string, number> }>): Map<TokenId, number> {
  const out = new Map<TokenId, number>()
  for (const [k, v] of Object.entries(rates)) {
    const usd = v.prices?.USD
    if (usd === undefined || !(usd > 0)) continue
    try {
      out.set(k.toUpperCase() === 'TON' ? 'native' : tokenId(k), usd)
    }
    catch { /* unknown key */ }
  }
  return out
}

export function poolUrl(p: Pool): string {
  const friendly = Address.parse(p.address).toString({ bounceable: true, urlSafe: true })
  return p.dex === 'stonfi' ? `https://app.ston.fi/pools/${friendly}` : `https://dedust.io/pools/${friendly}`
}

// ---------- loading ----------

export interface LpClients {
  tonapi: <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>
  tonapiPost: <T>(path: string, body: unknown) => Promise<T>
  stonfi: <T>(path: string) => Promise<T>
}

interface TonapiJettonBalance {
  balance: string
  jetton: { address: string, name: string, symbol: string, decimals: number, image?: string }
}
interface TonapiJetton {
  total_supply: string
  interfaces?: string[]
  preview?: string
  metadata: { address: string, name?: string, symbol?: string, decimals?: string, image?: string }
}

export interface LoadResult {
  positions: Position[]
  tokens: Map<TokenId, TokenInfo>
  prices: Map<TokenId, number>
  warnings: string[]
}

const isNotFound = (e: unknown) => [400, 404].includes((e as { status?: number })?.status ?? 0)

export async function loadPositions(owner: string, c: LpClients, opts: { mainnet: boolean, progress?: (s: string) => void }): Promise<LoadResult> {
  const warnings: string[] = []
  const progress = opts.progress ?? (() => {})
  const tokens = new Map<TokenId, TokenInfo>([['native', { symbol: COIN_SYMBOL, decimals: 9 }]])

  progress('Reading the wallet’s tokens…')
  const farmsJob = opts.mainnet
    ? c.stonfi<{ farm_list: StonfiFarm[] }>(`/v1/wallets/${owner}/farms`).then(r => activeStakes(r.farm_list), () => {
        warnings.push('STON.fi farms could not be loaded, so staked LP is missing.')
        return []
      })
    : Promise.resolve([])
  const { balances } = await c.tonapi<{ balances: TonapiJettonBalance[] }>(`accounts/${owner}/jettons`)
  const held = balances
    .filter(b => BigInt(b.balance) > 0n)
    .flatMap(b => {
      const dex = lpCandidate(b.jetton)
      return dex ? [{ dex, master: tokenId(b.jetton.address), name: b.jetton.name, lp: BigInt(b.balance) }] : []
    })
  const stakes = await farmsJob

  // STON.fi: its API knows every real pool (fake LP tokens get a 404).
  const pools = new Map<string, Pool>()
  // The STON.fi API is mainnet only: a testnet pool would just 404 there and vanish without a word.
  const stonHeld = held.filter(h => h.dex === 'stonfi')
  if (!opts.mainnet && stonHeld.length) warnings.push('STON.fi positions are shown on mainnet only: the STON.fi API has no testnet data.')
  const stonAddrs = opts.mainnet ? [...new Set([...stonHeld.map(h => h.master), ...stakes.map(s => s.pool)])] : []
  for (const [i, a] of stonAddrs.entries()) {
    progress(`Loading STON.fi pools ${i + 1} / ${stonAddrs.length}…`)
    try {
      pools.set(a, fromStonfi((await c.stonfi<{ pool: StonfiPool }>(`/v1/pools/${a}`)).pool))
    }
    catch (e) {
      if (!isNotFound(e)) warnings.push(`STON.fi pool ${a.slice(0, 10)}… could not be loaded.`)
    }
  }

  // DeDust: confirm by the indexer's code-based interface, then read reserves and assets on-chain.
  const dd = held.filter(h => h.dex === 'dedust')
  if (dd.length) {
    progress('Checking DeDust pools…')
    const { jettons } = await c.tonapiPost<{ jettons: TonapiJetton[] }>('jettons/_bulk', { account_ids: dd.map(h => h.master) })
    for (const j of jettons) {
      if (!j.interfaces?.includes('dedust_pool')) continue
      const addr = tokenId(j.metadata.address)
      progress(`Reading DeDust pool ${j.metadata.name ?? ''}…`)
      try {
        const [r, a] = await Promise.all([
          c.tonapi<{ success: boolean, decoded: { reserve0: string, reserve1: string } }>(`blockchain/accounts/${addr}/methods/get_reserves`),
          c.tonapi<{ success: boolean, decoded: { asset0: DedustAsset, asset1: DedustAsset } }>(`blockchain/accounts/${addr}/methods/get_assets`)
        ])
        pools.set(addr, fromDedust(addr, j.metadata.name ?? '', j.total_supply, r.decoded, a.decoded))
      }
      catch {
        warnings.push(`DeDust pool ${j.metadata.name ?? addr} could not be read.`)
      }
    }
  }

  const positions: Position[] = [
    ...held.flatMap(h => (pools.has(h.master) ? [{ pool: pools.get(h.master)!, lp: h.lp, source: 'wallet' as const }] : [])),
    ...stakes.flatMap(s => (pools.has(s.pool) ? [{ pool: pools.get(s.pool)!, lp: s.lp, source: 'farm' as const, farm: s.stake }] : []))
  ]

  // Token metadata and USD prices for everything involved.
  const ids = [...new Set(positions.flatMap(p => [...p.pool.tokens, ...(p.farm?.rewards.map(r => r.token) ?? [])]))].filter(t => t !== 'native')
  if (ids.length) {
    progress('Loading token details…')
    try {
      const { jettons } = await c.tonapiPost<{ jettons: TonapiJetton[] }>('jettons/_bulk', { account_ids: ids })
      for (const j of jettons) {
        tokens.set(tokenId(j.metadata.address), { symbol: j.metadata.symbol || '?', decimals: Number(j.metadata.decimals ?? 9), image: j.preview ?? j.metadata.image })
      }
    }
    catch {
      warnings.push('Token names could not be loaded.')
    }
  }
  let prices = new Map<TokenId, number>()
  if (positions.length && opts.mainnet) {
    progress('Loading prices…')
    try {
      const r = await c.tonapi<{ rates: Record<string, { prices?: Record<string, number> }> }>('rates', { tokens: ['ton', ...ids].join(','), currencies: 'usd' })
      prices = pricesFromRates(r.rates)
    }
    catch {
      warnings.push('Prices could not be loaded, so USD values are missing.')
    }
  }
  return { positions, tokens, prices, warnings }
}
