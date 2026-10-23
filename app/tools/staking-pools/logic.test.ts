import { describe, expect, it } from 'vitest'
import type { StakingPool } from '~/lib/staking/pools'
import { cheapestEntry, summarize } from './logic'

// Real items from tonapi GET /v2/staking/pools (2026-10-22), trimmed.
const P = (p: Partial<StakingPool>) => ({ cycle_start: 0, verified: false, cycle_length: 131072, ...p }) as StakingPool
const POOLS = [
  P({ address: '0:00ff9f', name: 'Tonkeeper Queue #1', implementation: 'whales', total_amount: 6749798722630912, apy: 12.258967499999999, min_stake: 50000000000, cycle_end: 1792856116, verified: true, current_nominators: 3967, max_nominators: 30000 }),
  P({ address: '0:c5be7c', name: 'Whales Club Queue #1', implementation: 'whales', total_amount: 6620834529280960, apy: 13.4, min_stake: 50000000000, cycle_end: 1792856116, verified: true, current_nominators: 92, max_nominators: 30000 }),
  P({ address: '0:a45b17', name: 'Tonstakers', implementation: 'liquidTF', total_amount: 142597607640937625, apy: 12.459616631498214, min_stake: 1000000000, cycle_end: 1792790880, verified: true, current_nominators: 49789, max_nominators: -1, cycle_length: 65536 }),
  P({ address: '-1:1189458e', name: 'HB Pool #1', implementation: 'tf', total_amount: 1404720000000000, apy: 16.35, min_stake: 10001000000000, cycle_end: 1792821576, current_nominators: 4, max_nominators: 40 }),
  P({ address: '-1:dc19ae57', name: 'Ef_cGa5X…', implementation: 'tf', total_amount: 2595072000000000, apy: 16.35, min_stake: 300001000000000, cycle_end: 1792887112, current_nominators: 1, max_nominators: 1 }),
  P({ address: '-1:ab34fcd8', name: 'Ef-rNPzY…', implementation: 'tf', total_amount: 20031000000000, apy: 16.35, min_stake: 2501000000000, cycle_end: 1655305299, current_nominators: 0, max_nominators: 37 })
]
const NOW = 1792740984

describe('summarize', () => {
  it('groups active pools by kind', () => {
    const s = summarize(POOLS, NOW)
    expect(s.map(k => k.kind)).toEqual(['liquidTF', 'whales', 'tf'])
    const whales = s.find(k => k.kind === 'whales')!
    expect(whales.pools).toBe(2)
    expect(whales.bestApy).toBe(13.4)
    expect(whales.nominators).toBe(3967 + 92)
    const tf = s.find(k => k.kind === 'tf')!
    // The 2022 pool is dead; the full private pool does not count for the minimum.
    expect(tf.pools).toBe(2)
    expect(tf.minStake).toBe(10001000000000)
  })
  it('finds the cheapest way in', () => {
    expect(cheapestEntry(POOLS, NOW)!.name).toBe('Tonstakers')
    expect(cheapestEntry(POOLS.filter(p => p.implementation === 'tf'), NOW)!.name).toBe('HB Pool #1')
    expect(cheapestEntry([], NOW)).toBeNull()
  })
})
