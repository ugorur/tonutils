// Builds a wallet's staking overview: nominator positions, liquid staking tokens and pending Tonstakers withdrawals.
import { Address } from '@ton/core'
import type { NominatorPosition, StakingPool } from '~/lib/staking/pools'
import { kindOf, KINDS, nano, OTHER_LIQUID, rawKey } from '~/lib/staking/pools'
import { parseUnits } from '~/utils/units'

/** tonapi /v2/accounts/{id}/jettons?currencies=ton,usd item (the fields we use). */
export interface TonapiJetton {
  balance: string
  price?: { prices?: Record<string, number> }
  wallet_address: { address: string }
  jetton: { address: string, name: string, symbol: string, decimals: number, image?: string, verification?: string }
}

/** tonapi /v2/accounts/{id}/nfts item (the fields we use). */
export interface TonapiNft {
  address: string
  collection?: { address: string, name?: string }
  metadata?: { name?: string }
}

export type RowKind = 'pool' | 'liquid' | 'bill'

export interface StakeRow {
  kind: RowKind
  name: string
  /** Pool or jetton master (raw). */
  address: string
  /** Liquid token / bill amount in token base units (9 decimals). */
  tokens?: bigint
  symbol?: string
  /** GRAM per token. */
  rate?: number
  /** Nominator position parts, nano. */
  active?: bigint
  pendingDeposit?: bigint
  pendingWithdraw?: bigint
  readyWithdraw?: bigint
  /** Value in nanoGRAM. */
  value: bigint
  /** Percent, when known. */
  apy?: number
  /** Estimated rewards per year at the current APY, nanoGRAM. */
  yearly?: bigint
  /** Withdrawal bill: unix time after which it is paid. */
  payoutAfter?: number
  /** Pool kind label. */
  label: string
}

export interface Overview {
  rows: StakeRow[]
  total: bigint
  yearly: bigint
  /** Positions/tokens without a known APY (left out of the reward estimate). */
  unknownApy: number
}

const tokensToNano = (tokens: bigint, rate: number) => (tokens * BigInt(Math.round(rate * 1e9))) / 1_000_000_000n
const yearlyOf = (value: bigint, apy?: number) => (apy === undefined ? undefined : (value * BigInt(Math.round(apy * 100))) / 10_000n)
const toRaw = (a: string) => Address.parse(a).toRawString()

/** "Bill for 71.917231432 Pool Jetton in Withdrawal Payout#1527" -> 71917231432n. */
export function billAmount(name: string | undefined): bigint | null {
  const m = name?.match(/^Bill for ([\d.]+) Pool Jetton/)
  if (!m) return null
  try {
    return parseUnits(m[1]!, 9)
  }
  catch {
    return null
  }
}

/** Collection name tonapi shows for Tonstakers payout bills; the collection owner must also be the pool (checked by the caller). */
export const isPayoutCollection = (n: TonapiNft) => /^Withdrawal Payout#\d+$/.test(n.collection?.name ?? '')

export interface OverviewInput {
  positions: NominatorPosition[]
  pools: StakingPool[]
  jettons: TonapiJetton[]
  /** NFTs already filtered to bills from collections owned by a liquid pool, with that pool's address. */
  bills: { nft: TonapiNft, pool: string }[]
  /** GRAM per tsTON from the pool (total_balance / supply); falls back to the tonapi price. */
  liquidRates?: Record<string, number>
}

export function buildOverview(i: OverviewInput): Overview {
  const byPool = new Map(i.pools.map(p => [rawKey(p.address), p]))
  const rows: StakeRow[] = []

  const billPools = new Set(i.bills.map(b => rawKey(b.pool)))
  for (const pos of i.positions) {
    const pool = byPool.get(rawKey(pos.pool))
    const kind = pool ? kindOf(pool) : null
    // tonapi lists a liquid pool position only for unstakes in flight; the bills below show those in detail.
    if (kind === 'liquidTF' && billPools.has(rawKey(pos.pool))) continue
    const active = nano(pos.amount)
    // In a liquid pool the pending withdrawal is no longer held as tsTON, so it counts here.
    const value = active + nano(pos.pending_deposit) + nano(pos.ready_withdraw) + (kind === 'liquidTF' ? nano(pos.pending_withdraw) : 0n)
    if (value === 0n && !pos.pending_withdraw) continue
    rows.push({
      kind: 'pool',
      name: pool?.name ?? 'Unknown pool',
      address: pos.pool,
      label: kind ? KINDS[kind].label : 'Nominator pool',
      active,
      pendingDeposit: nano(pos.pending_deposit),
      pendingWithdraw: nano(pos.pending_withdraw),
      readyWithdraw: nano(pos.ready_withdraw),
      value,
      apy: pool?.apy,
      // Rewards accrue on the active stake only.
      yearly: yearlyOf(active, pool?.apy)
    })
  }

  // Liquid staking tokens: masters announced by tonapi pools, plus the known ones tonapi does not list (bemo, Hipo).
  const liquid = new Map<string, { name: string, apy?: number, pool?: string }>()
  for (const p of i.pools) {
    if (p.liquid_jetton_master) liquid.set(rawKey(p.liquid_jetton_master), { name: p.name, apy: p.apy, pool: p.address })
  }
  for (const o of OTHER_LIQUID) liquid.set(rawKey(toRaw(o.master)), { name: o.name })

  for (const j of i.jettons) {
    const info = liquid.get(rawKey(j.jetton.address))
    const tokens = BigInt(j.balance)
    if (!info || tokens === 0n) continue
    const rate = (info.pool && i.liquidRates?.[rawKey(info.pool)]) || j.price?.prices?.TON
    const value = rate ? tokensToNano(tokens, rate) : 0n
    rows.push({ kind: 'liquid', name: `${j.jetton.symbol} (${info.name})`, address: j.jetton.address, label: 'Liquid staking token', tokens, symbol: j.jetton.symbol, rate, value, apy: info.apy, yearly: yearlyOf(value, info.apy) })
  }

  // Fallback rates when the pool get-method failed (e.g. rate limit): tonapi's pending_withdraw for the pool divided by
  // the tokens in its bills (tonapi values in-flight unstakes in GRAM), else the market price of the pool's liquid token.
  const billTokens = new Map<string, bigint>()
  for (const { nft, pool } of i.bills) billTokens.set(rawKey(pool), (billTokens.get(rawKey(pool)) ?? 0n) + (billAmount(nft.metadata?.name) ?? 0n))
  const fallbackRate = (pool: string): number | undefined => {
    const pos = i.positions.find(x => rawKey(x.pool) === pool)
    const tokens = billTokens.get(pool)
    if (pos?.pending_withdraw && tokens) return pos.pending_withdraw / Number(tokens)
    const master = byPool.get(pool)?.liquid_jetton_master
    return (master && i.jettons.find(j => rawKey(j.jetton.address) === rawKey(master))?.price?.prices?.TON) || undefined
  }

  for (const { nft, pool } of i.bills) {
    const tokens = billAmount(nft.metadata?.name)
    if (tokens === null) continue
    const p = byPool.get(rawKey(pool))
    const rate = i.liquidRates?.[rawKey(pool)] || fallbackRate(rawKey(pool))
    rows.push({ kind: 'bill', name: `Withdrawal bill (${p?.name ?? 'liquid pool'})`, address: nft.address, label: 'Unstaking, paid after the round', tokens, symbol: 'tsTON', rate, value: rate ? tokensToNano(tokens, rate) : 0n, payoutAfter: p?.cycle_end })
  }

  const total = rows.reduce((s, r) => s + r.value, 0n)
  const yearly = rows.reduce((s, r) => s + (r.yearly ?? 0n), 0n)
  const unknownApy = rows.filter(r => r.kind !== 'bill' && r.yearly === undefined).length
  return { rows, total, yearly, unknownApy }
}
