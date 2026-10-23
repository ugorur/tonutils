// Staking pools explorer: filtering/sorting live in ~/lib/staking/pools; this adds the overview numbers.
import type { PoolKind, StakingPool } from '~/lib/staking/pools'
import { isActive, kindOf } from '~/lib/staking/pools'

export interface KindSummary {
  kind: PoolKind
  pools: number
  /** Sum of total_amount over active pools (nano, float: display only). */
  tvl: number
  nominators: number
  /** Lowest min_stake among active, non-full pools (nano), null when none accept nominators. */
  minStake: number | null
  /** Best APY among active pools. */
  bestApy: number | null
}

export function summarize(pools: StakingPool[], nowSec: number): KindSummary[] {
  const out = new Map<PoolKind, KindSummary>()
  for (const p of pools) {
    const kind = kindOf(p)
    if (!kind || !isActive(p, nowSec)) continue
    const s = out.get(kind) ?? { kind, pools: 0, tvl: 0, nominators: 0, minStake: null, bestApy: null }
    s.pools++
    s.tvl += p.total_amount
    s.nominators += Math.max(p.current_nominators, 0)
    const open = p.max_nominators < 0 || p.current_nominators < p.max_nominators
    if (open) s.minStake = s.minStake === null ? p.min_stake : Math.min(s.minStake, p.min_stake)
    s.bestApy = s.bestApy === null ? p.apy : Math.max(s.bestApy, p.apy)
    out.set(kind, s)
  }
  const order: PoolKind[] = ['liquidTF', 'whales', 'tf']
  return order.flatMap(k => out.get(k) ?? [])
}

/** The cheapest way in: open active pools sorted by minimum stake, verified first. */
export function cheapestEntry(pools: StakingPool[], nowSec: number): StakingPool | null {
  const open = pools.filter(p => isActive(p, nowSec) && (p.max_nominators < 0 || p.current_nominators < p.max_nominators))
  open.sort((a, b) => Number(b.verified) - Number(a.verified) || a.min_stake - b.min_stake)
  return open[0] ?? null
}
