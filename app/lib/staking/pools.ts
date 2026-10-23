// Shared staking helpers for the staking batch (pools explorer, my staking, stake/unstake, calculator).
// Pure TS, no @ton/*: safe anywhere. Data comes from tonapi /v2/staking/*.
import { KNOWN_JETTONS } from '~/utils/ton/jetton'

/** tonapi /v2/staking/pools item. Amounts are JSON numbers in nanoGRAM (TVL can exceed 2^53, display only). */
export interface StakingPool {
  address: string
  name: string
  total_amount: number
  implementation: string
  /** Percent, e.g. 12.46. */
  apy: number
  min_stake: number
  cycle_start: number
  cycle_end: number
  verified: boolean
  current_nominators: number
  /** -1 = unlimited (liquid staking). */
  max_nominators: number
  liquid_jetton_master?: string
  nominators_stake?: number
  validator_stake?: number
  /** Seconds between payouts for this pool (65536 = one validation round, 131072 = every other round). */
  cycle_length?: number
}

/** tonapi /v2/staking/nominator/{id}/pools item (nanoGRAM numbers). */
export interface NominatorPosition {
  pool: string
  amount: number
  pending_deposit: number
  pending_withdraw: number
  ready_withdraw: number
}

export type PoolKind = 'liquidTF' | 'whales' | 'tf'

export interface KindInfo {
  label: string
  provider: string
  /** Verified link (we do not use the URLs tonapi returns: some are dead). */
  url: string
  blurb: string
  icon: string
}

export const KINDS: Record<PoolKind, KindInfo> = {
  liquidTF: {
    label: 'Liquid staking',
    provider: 'Tonstakers',
    url: 'https://tonstakers.com/',
    blurb: 'You get tsTON, a token that grows in value every round. Unstake any time: instantly if the pool has spare liquidity, otherwise after the round ends.',
    icon: 'i-lucide-droplets'
  },
  whales: {
    label: 'Nominator pool (TON Whales)',
    provider: 'TON Whales',
    url: 'https://tonwhales.com/staking',
    blurb: 'Rewards are added to your stake every other round. Withdrawals are paid after the current round ends.',
    icon: 'i-lucide-waves'
  },
  tf: {
    label: 'Nominator pool (TON Core)',
    provider: 'TON Core nominator-pool contract',
    url: 'https://github.com/ton-blockchain/nominator-pool',
    blurb: 'The standard pool contract run by an independent validator. High minimums and a fixed nominator list; most are private. Deposit with the comment "d", withdraw with "w".',
    icon: 'i-lucide-server'
  }
}

export function kindOf(p: Pick<StakingPool, 'implementation'>): PoolKind | null {
  return p.implementation in KINDS ? p.implementation as PoolKind : null
}

/** One validation round on mainnet (config param 15, validators_elected_for). */
export const ROUND_SECONDS = 65536

/** Liquid staking tokens not listed by tonapi's staking API: shown as link-outs with a live price. */
export const OTHER_LIQUID = [
  { symbol: 'stGRAM', name: 'bemo', url: 'https://bemo.fi/', master: KNOWN_JETTONS.find(j => j.symbol === 'stGRAM')!.master },
  { symbol: 'hGRAM', name: 'Hipo', url: 'https://hipo.finance/', master: KNOWN_JETTONS.find(j => j.symbol === 'hGRAM')!.master }
] as const

/** tonapi numbers -> bigint nano. */
export function nano(n: number | undefined | null): bigint {
  // ponytail: tonapi sends JSON numbers; exact below 2^53 nano (~9M GRAM). Only TVLs exceed it, and those are display-only.
  return BigInt(Math.round(n ?? 0))
}

/** Lower-case raw form, for comparing tonapi addresses (they mix case). */
export const rawKey = (a: string) => a.trim().toLowerCase()

export function isFull(p: StakingPool): boolean {
  return p.max_nominators >= 0 && p.current_nominators >= p.max_nominators
}

/** Pools with money in them that took part in a recent round. tonapi also lists long-dead contracts. */
export function isActive(p: StakingPool, nowSec: number): boolean {
  const len = p.cycle_length || ROUND_SECONDS * 2
  return p.total_amount > 0 && p.cycle_end > nowSec - 2 * len
}

/** tonapi reports the same network-wide APY for every TON Core nominator pool, not a per-pool figure. */
export function apyIsEstimate(p: StakingPool): boolean {
  return p.implementation === 'tf'
}

export type PoolSort = 'tvl' | 'apy' | 'min' | 'nominators'

export interface PoolFilter {
  /** Verified pools only (TON Whales, Tonstakers). */
  verifiedOnly: boolean
  /** Hide dead and empty pools. */
  activeOnly: boolean
  /** Hide pools whose nominator list is full. */
  openOnly: boolean
  search: string
  sort: PoolSort
}

export function filterPools(pools: StakingPool[], f: PoolFilter, nowSec: number): StakingPool[] {
  const q = f.search.trim().toLowerCase()
  const out = pools.filter(p =>
    (!f.verifiedOnly || p.verified)
    && (!f.activeOnly || isActive(p, nowSec))
    && (!f.openOnly || !isFull(p))
    && (!q || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || (KINDS[kindOf(p)!]?.provider.toLowerCase().includes(q) ?? false))
  )
  const key: Record<PoolSort, (p: StakingPool) => number> = {
    tvl: p => -p.total_amount,
    apy: p => -p.apy,
    min: p => p.min_stake,
    nominators: p => -p.current_nominators
  }
  // Verified pools first, then by the chosen key.
  return out.sort((a, b) => Number(b.verified) - Number(a.verified) || key[f.sort](a) - key[f.sort](b))
}

/** "in 5 h 20 min" / "12 min ago". */
export function relativeTime(unix: number, nowSec: number): string {
  const d = unix - nowSec
  const s = Math.abs(d)
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const text = days ? `${days} d ${h} h` : h ? `${h} h ${m} min` : `${Math.max(m, 1)} min`
  return d >= 0 ? `in ${text}` : `${text} ago`
}

/** 131072 -> "~36 h". */
export function cycleLabel(seconds: number | undefined): string {
  const h = (seconds || ROUND_SECONDS) / 3600
  return `~${Math.round(h)} h`
}

/** Next payout boundary: cycle_end, or (if already past) projected forward by whole cycles. */
export function nextCycleEnd(p: Pick<StakingPool, 'cycle_end' | 'cycle_length'>, nowSec: number): number {
  const len = p.cycle_length || ROUND_SECONDS
  if (p.cycle_end >= nowSec) return p.cycle_end
  return p.cycle_end + Math.ceil((nowSec - p.cycle_end) / len) * len
}

/** GRAM as a plain number from nano (display only). */
export const coins = (n: number | bigint) => Number(n) / 1e9

/** Compact GRAM figure for TVLs: 142.6M, 6.75M, 950K. */
export function compactCoins(nanoAmount: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(coins(nanoAmount))
}

export function formatUsd(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 100 ? 2 : 0 }).format(v)
}

// ---------------------------------------------------------------- fetching (tonapi through useTonapi)

export interface TonapiGet {
  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>
}

export async function fetchPools(api: TonapiGet, availableFor?: string): Promise<StakingPool[]> {
  const r = await api.get<{ pools: StakingPool[] }>('staking/pools', availableFor ? { available_for: availableFor } : undefined)
  return r.pools
}

/** tonapi get-method result. Numbers come as hex strings in `num`, cells as hex BOC in `cell`. */
export interface TonapiMethodResult {
  success: boolean
  exit_code: number
  stack: { type: string, num?: string, cell?: string, slice?: string }[]
  decoded?: unknown
}

export async function runGetMethod(api: TonapiGet, address: string, method: string, args?: string[]): Promise<TonapiMethodResult> {
  return api.get<TonapiMethodResult>(`blockchain/accounts/${address}/methods/${method}`, args?.length ? { args: args.join(',') } : undefined)
}

/** Signed hex ("-0x1", "0x5f5e100") -> bigint. */
export function stackNum(item: { num?: string } | undefined): bigint {
  const s = item?.num
  if (s === undefined) throw new Error('Expected a number on the get-method stack')
  return s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s)
}

/** TON Whales get_params(): fees the pool charges (exact values matter: withdraw requires value == withdraw_fee + receipt_price). */
export interface WhalesParams {
  enabled: boolean
  minStake: bigint
  depositFee: bigint
  withdrawFee: bigint
  /** Basis points of rewards (2500 = 25%). */
  poolFee: bigint
  receiptPrice: bigint
}

export function parseWhalesParams(r: TonapiMethodResult): WhalesParams {
  if (r.exit_code !== 0) throw new Error(`get_params failed with exit code ${r.exit_code}. Is this a TON Whales pool?`)
  const [enabled, , minStake, depositFee, withdrawFee, poolFee, receiptPrice] = r.stack.map(stackNum)
  return { enabled: enabled !== 0n, minStake: minStake!, depositFee: depositFee!, withdrawFee: withdrawFee!, poolFee: poolFee!, receiptPrice: receiptPrice! }
}

/** tsTON (or any LST) -> GRAM rate from the Tonstakers pool's get_pool_full_data (total_balance / supply). */
export function liquidRate(r: TonapiMethodResult): number {
  if (r.exit_code !== 0) throw new Error(`get_pool_full_data failed with exit code ${r.exit_code}`)
  const balance = stackNum(r.stack[2])
  const supply = stackNum(r.stack[13])
  return supply > 0n ? Number(balance * 1_000_000_000n / supply) / 1e9 : 1
}
