import { describe, expect, it } from 'vitest'
import type { StakingPool, TonapiMethodResult } from './pools'
import { apyIsEstimate, filterPools, isActive, isFull, kindOf, liquidRate, nextCycleEnd, parseWhalesParams, relativeTime, stackNum } from './pools'

// Real tonapi /v2/staking/pools items (fetched 2026-10-22).
const TONKEEPER_Q1: StakingPool = { address: '0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a', name: 'Tonkeeper Queue #1', total_amount: 6749798722630912, implementation: 'whales', apy: 12.258967499999999, min_stake: 50000000000, cycle_start: 1792757512, cycle_end: 1792856116, verified: true, current_nominators: 3967, max_nominators: 30000, nominators_stake: 6270777584529856, validator_stake: 479021138101056, cycle_length: 131072 }
const TONSTAKERS: StakingPool = { address: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa', name: 'Tonstakers', total_amount: 142597607640937625, implementation: 'liquidTF', apy: 12.459616631498214, min_stake: 1000000000, cycle_start: 1792691976, cycle_end: 1792790880, verified: true, current_nominators: 144302, max_nominators: -1, liquid_jetton_master: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', nominators_stake: 0, validator_stake: 0, cycle_length: 65536 }
const DEAD_TF: StakingPool = { address: '-1:ab34fcd8ecf73f85a', name: 'Ef-rNPzY7Pc_hawYt2wqWrpv56ZOkWcF4s6M7qgm70umcH2M', total_amount: 20031000000000, implementation: 'tf', apy: 16.35, min_stake: 2501000000000, cycle_start: 1655174227, cycle_end: 1655305299, verified: false, current_nominators: 0, max_nominators: 37, cycle_length: 131072 }
const FULL_TF: StakingPool = { address: '-1:dc19ae5797b138efb', name: 'Ef_cGa5Xl7E4775MJAnrYnI7T70tvoj_p30XzNivnT7EPP5H', total_amount: 2595072000000000, implementation: 'tf', apy: 16.35, min_stake: 300001000000000, cycle_start: 1792756040, cycle_end: 1792887112, verified: false, current_nominators: 1, max_nominators: 1, cycle_length: 131072 }
const NOW = 1792740984

describe('pool classification', () => {
  it('maps implementations', () => {
    expect(kindOf(TONSTAKERS)).toBe('liquidTF')
    expect(kindOf(TONKEEPER_Q1)).toBe('whales')
    expect(kindOf({ implementation: 'other' })).toBeNull()
  })
  it('detects dead, full and estimated pools', () => {
    expect(isActive(TONKEEPER_Q1, NOW)).toBe(true)
    expect(isActive(DEAD_TF, NOW)).toBe(false)
    expect(isFull(FULL_TF)).toBe(true)
    expect(isFull(TONSTAKERS)).toBe(false)
    expect(apyIsEstimate(FULL_TF)).toBe(true)
    expect(apyIsEstimate(TONSTAKERS)).toBe(false)
  })
  it('filters and sorts (verified first)', () => {
    const all = [DEAD_TF, FULL_TF, TONKEEPER_Q1, TONSTAKERS]
    const base = { verifiedOnly: false, activeOnly: true, openOnly: false, search: '', sort: 'tvl' as const }
    expect(filterPools(all, base, NOW).map(p => p.name)).toEqual(['Tonstakers', 'Tonkeeper Queue #1', FULL_TF.name])
    expect(filterPools(all, { ...base, openOnly: true }, NOW)).toHaveLength(2)
    expect(filterPools(all, { ...base, verifiedOnly: true, sort: 'min' }, NOW).map(p => p.name)).toEqual(['Tonstakers', 'Tonkeeper Queue #1'])
    expect(filterPools(all, { ...base, search: 'whales' }, NOW).map(p => p.name)).toEqual(['Tonkeeper Queue #1'])
  })
})

describe('time helpers', () => {
  it('formats relative time', () => {
    expect(relativeTime(NOW + 5 * 3600 + 20 * 60, NOW)).toBe('in 5 h 20 min')
    expect(relativeTime(NOW - 12 * 60, NOW)).toBe('12 min ago')
    expect(relativeTime(NOW + 2 * 86400 + 3600, NOW)).toBe('in 2 d 1 h')
  })
  it('projects the next cycle end', () => {
    expect(nextCycleEnd(TONKEEPER_Q1, NOW)).toBe(TONKEEPER_Q1.cycle_end)
    expect(nextCycleEnd({ cycle_end: NOW - 10, cycle_length: 65536 }, NOW)).toBe(NOW - 10 + 65536)
  })
})

describe('get-method parsing', () => {
  it('parses signed hex', () => {
    expect(stackNum({ num: '-0x1' })).toBe(-1n)
    expect(stackNum({ num: '0x5f5e100' })).toBe(100000000n)
  })
  // tonapi GET /v2/blockchain/accounts/0:00ff9f…/methods/get_params (Tonkeeper Queue #1), 2026-10-23.
  // tonapi decoded the same stack as min_stake 49800000000, deposit_fee 100000000, withdraw_fee 100000000, pool_fee 2500, receipt_price 100000000.
  it('parses TON Whales get_params', () => {
    const r: TonapiMethodResult = { success: true, exit_code: 0, stack: ['-0x1', '-0x1', '0xb984fb200', '0x5f5e100', '0x5f5e100', '0x9c4', '0x5f5e100'].map(num => ({ type: 'num', num })) }
    expect(parseWhalesParams(r)).toEqual({ enabled: true, minStake: 49800000000n, depositFee: 100000000n, withdrawFee: 100000000n, poolFee: 2500n, receiptPrice: 100000000n })
    expect(() => parseWhalesParams({ ...r, exit_code: 11 })).toThrow(/exit code 11/)
  })
  // tonapi get_pool_full_data on the Tonstakers pool: total_balance 142699717640937625, supply 121859086896322285.
  // tonapi /v2/rates priced tsTON at 1.17129 TON at the same time.
  it('computes the tsTON rate', () => {
    const stack = Array.from({ length: 30 }, () => ({ type: 'num', num: '0x0' }))
    stack[2] = { type: 'num', num: '0x1faf8a31b896099' }
    stack[13] = { type: 'num', num: '0x1b0ee31a31bd6ed' }
    const rate = liquidRate({ success: true, exit_code: 0, stack })
    expect(rate).toBeCloseTo(1.17102, 4)
  })
})
