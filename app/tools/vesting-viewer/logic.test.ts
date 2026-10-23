import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { humanDuration, parseVestingData, unlockSchedule, vestingLockedAmount, vestingNow } from './logic'

// Vesting wallet EQDWiWnUDVf5F6DpTuOE9528gWJ_DpiaII5E64Dl0gMuGNNS, data from toncenter /api/v3/account (2026-10-22).
// toncenter /api/v3/vesting for the same contract: start 1729242000, duration 124416000, period 2592000,
// cliff 31104000, total 1710938000000000. Locked amounts: the contract's get_locked_amount(t) via toncenter runGetMethod.
const DATA = 'te6ccgEBAwEAswACUQAAAAkAAAEMDLNM9jlozW7dKUbMZ8oGtykp6nWsZ1gGFIIEsJl7e/DAAQIARaEf4hTzsQ9S8I1WhXGBJuXKe2N/PqNi1gGR/71g2snqt0MYAL0AAAAAZxIjkAdqcAAAJ40AAdqcAHBhQWy7kEAIATO4U1sMKqJDkWGdNuqoWi4p4NZ/SF6o5bL37DuPHSCRAAG3pIvsXdFJVKVLmf+bh+9zMUcM51RNoysUgCWv8Q3q4A=='
const v = parseVestingData(Cell.fromBase64(DATA))
const ON_CHAIN: [number, bigint][] = [
  [1760345999, 0x61416cbb90400n],
  [1760346000, 0x48f1118cac300n],
  [1792687033, 0x30a0b65dc8200n],
  [1853657999, 0x206b243e856bn],
  [1853658000, 0n]
]

describe('unlockSchedule', () => {
  const ev = unlockSchedule(v)!
  it('matches the toncenter vesting record', () => {
    expect([v.startTime, v.totalDuration, v.unlockPeriod, v.cliffDuration, v.totalAmount]).toEqual([1729242000, 124416000, 2592000, 31104000, 1710938000000000n])
  })
  it('first unlock at the cliff releases the 12 months already vested, then 36 monthly steps', () => {
    expect(ev).toHaveLength(37)
    expect(ev[0]!.time).toBe(1729242000 + 31104000)
    expect(ev[0]!.lockedAfter).toBe(0x48f1118cac300n)
    expect(ev.at(-1)!.time).toBe(1853658000)
    expect(ev.at(-1)!.lockedAfter).toBe(0n)
    expect(ev.reduce((s, e) => s + e.amount, 0n)).toBe(v.totalAmount)
  })
  it.each(ON_CHAIN)('locked after the last event before %i = get_locked_amount', (t, want) => {
    const last = ev.filter(e => e.time <= t).at(-1)
    expect(last?.lockedAfter ?? v.totalAmount).toBe(want)
    expect(vestingLockedAmount(v, t)).toBe(want)
  })
  it('refuses absurd period counts', () => {
    expect(unlockSchedule({ ...v, unlockPeriod: 1 })).toBeNull()
  })
})

describe('vestingNow', () => {
  const ev = unlockSchedule(v)
  it('during vesting', () => {
    // on-chain balance 1363295392073802 (toncenter /api/v3/account)
    const n = vestingNow(v, 1363295392073802n, 1792687033, ev)
    expect(n.phase).toBe('vesting')
    expect(n.locked).toBe(0x30a0b65dc8200n)
    expect(n.unlocked + n.locked).toBe(v.totalAmount)
    expect(n.withdrawable).toBe(1363295392073802n - 0x30a0b65dc8200n)
    expect(n.next!.time).toBeGreaterThan(1792687033)
  })
  it('in the cliff nothing can leave except to the whitelist', () => {
    const n = vestingNow(v, v.totalAmount, 1750000000, ev)
    expect(n.phase).toBe('cliff')
    expect(n.withdrawable).toBe(0n)
    expect(n.next!.time).toBe(1760346000)
  })
  it('before the start with no cliff, unlocked never goes negative', () => {
    const n = vestingNow({ ...v, cliffDuration: 0 }, 0n, v.startTime - 10, null)
    expect(n.phase).toBe('not-started')
    expect(n.unlocked).toBe(0n)
  })
  it('after the end', () => {
    expect(vestingNow(v, 5n, 1900000000, ev)).toMatchObject({ phase: 'done', locked: 0n, withdrawable: 5n, next: null })
  })
})

it('humanDuration', () => {
  expect(humanDuration(124416000)).toBe('3 years 11 months')
  expect(humanDuration(2592000)).toBe('1 month')
})
