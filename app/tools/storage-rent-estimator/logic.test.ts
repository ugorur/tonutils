// Vectors: live mainnet config (app/lib/fees-time/fixtures.json, toncenter getConfigParam 2026-10-23) and real accounts:
// - EQAMPiXGaw99H_Yf9zxj_wtNljKkfK7kWAISR9ICExnRYTtL: tonapi storage used_cells 22 / used_bits 5689; its tx e2360dcb… at
//   utime 1792742090 collected 1739 nano storage for the period since its previous tx at 1792703727 (toncenter v3).
// - USD₮ master EQCxE6mU…: tonapi /v2/blockchain/accounts response captured 2026-10-23.
// Freeze/delete thresholds follow transaction.cpp prepare_storage_phase (debt > freeze_due_limit / delete_due_limit).
import { describe, expect, it } from 'vitest'
import fx from '~/lib/fees-time/fixtures.json'
import { parseFeeConfig } from '~/lib/fees-time/fees'
import type { RentInput } from './logic'
import { accountToInput, dateOf, describeFrom, estimateRent } from './logic'

const cfg = parseFeeConfig(fx.config)
const limits = { freezeDueLimit: cfg.gas.basechain.freezeDueLimit, deleteDueLimit: cfg.gas.basechain.deleteDueLimit, prices: cfg.storage }

describe('storage rent estimator', () => {
  it('owed-now equals what the chain charged at the next transaction', () => {
    const r = estimateRent({ cells: 22n, bits: 5689n, balance: 525001542n, due: 0n, lastPaid: 1792703727, status: 'active', masterchain: false, now: 1792742090, years: 1, ...limits })
    expect(r.owedNow).toBe(1739n)
    // 22 cells * 135 (cell_price_ps since 1777500000) * 31536000 s / 2^16, rounded up; bit price is 0
    expect(r.perYear).toBe((22n * 135n * 31536000n + 65535n) / 65536n)
    expect(r.keepFor).toBe(1739n + r.perYear)
    expect(r.topUp).toBe(0n)
  })

  it('maps a real tonapi account response', () => {
    const usdt = { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', balance: 1073010444504, status: 'active' as const, storage: { used_cells: 29, used_bits: 12090, used_public_cells: 0, last_paid: 1792741285, due_payment: 0 } }
    expect(accountToInput(usdt)).toEqual({ cells: 29n, bits: 12090n, balance: 1073010444504n, due: 0n, lastPaid: 1792741285, status: 'active', masterchain: false })
    expect(accountToInput({ address: '-1:3333', balance: '5', status: 'active' }).masterchain).toBe(true)
  })

  it('freeze / delete / empty thresholds follow the node rule', () => {
    // Rate: 22 cells * 135 = 2970 nano*2^16 per second
    const base: RentInput = { cells: 22n, bits: 0n, balance: 1000n, due: 0n, lastPaid: 1792000000, status: 'active', masterchain: false, now: 1792000000, years: 10, ...limits }
    const r = estimateRent(base)
    const sec = (limit: bigint) => 1792000000 + Number(limit * 65536n / 2970n + 1n)
    expect(r.emptyAt).toBe(sec(1000n))
    expect(r.freezeAt).toBe(sec(1000n + 100_000_000n))
    expect(r.deleteAt).toBe(sec(1000n + 1_000_000_000n))
    // At freezeAt the owed amount first exceeds balance + 0.1; one second earlier it does not.
    const owed = (t: number) => estimateRent({ ...base, now: t }).owedNow
    expect(owed(r.freezeAt!) > 1000n + 100_000_000n).toBe(true)
    expect(owed(r.freezeAt! - 1) > 1000n + 100_000_000n).toBe(false)
    expect(r.topUp).toBe(r.keepFor - 1000n)
  })

  it('uninit accounts are deleted, never frozen; old debt counts', () => {
    const r = estimateRent({ cells: 1n, bits: 100n, balance: 0n, due: 2_000_000_000n, lastPaid: 1792000000, status: 'uninit', masterchain: false, now: 1792000100, years: 1, ...limits })
    expect(r.freezeAt).toBeNull()
    expect(r.deleteAt).toBe(1792000000)
    expect(r.owedNow >= 2_000_000_000n).toBe(true)
  })

  it('an empty account pays nothing', () => {
    const r = estimateRent({ cells: 0n, bits: 0n, balance: 0n, due: 0n, lastPaid: 0, status: 'nonexist', masterchain: false, now: 1792000000, years: 5, ...limits })
    expect(r.free).toBe(true)
    expect(r.emptyAt).toBeNull()
    expect(r.keepFor).toBe(0n)
  })

  it('formats distances', () => {
    expect(describeFrom(0, 90)).toBe('in 1 min')
    expect(describeFrom(0, 5 * 86400)).toBe('in 5 days')
    expect(describeFrom(0, 3 * 31536000)).toBe('in about 3 years')
    expect(describeFrom(0, 5000 * 31536000)).toBe('in more than 5,000 years')
    expect(describeFrom(10, 5)).toBe('already reached')
    expect(dateOf(1792742090)).toBe('2026-10-23') // date -u -d @1792742090
    expect(dateOf(1e15)).toBeNull()
  })
})
