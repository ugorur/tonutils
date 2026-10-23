import { describe, expect, it } from 'vitest'
import type { V2Fetch, V3Fetch } from '~/utils/api-client'
import type { V3Transaction } from '~/lib/accounts-history/transactions'
import { txBalanceDelta } from '~/lib/accounts-history/transactions'
import fx from './fixtures/range.json'
import { balanceDiff, dateRange, dayKey, percentChange, stepPath, summarize } from './logic'

// Recorded 2026-10-22 from mainnet for wallet 0:88C94E…CC46 (W5), range 2026-10-01 00:00 UTC (1790812800)
// to 2026-10-15 00:00 UTC (1792022400):
//   toncenter v2 lookupBlock -> masterchain 96135401 / 99072898, getShardAccountCell at both blocks,
//   toncenter v3 /transactions by lt range (20 txs, trimmed to the fields used).
// Independent check: tonapi.io /v2/accounts/{id}/diff?start_date=1790812800&end_date=1792022400
//   -> {"balance_change":-156140659055}.
const ADDR = '0:88C94E160EC19CDE32FFE72D9B5EB34AC224B28929B22F5D982D84039D6BCC46'
const FROM = 1790812800
const TO = 1792022400
const txs = fx.transactions as V3Transaction[]

function fakeApis() {
  const calls: string[] = []
  const v2: V2Fetch = async <T>(method: string, q?: Record<string, unknown>) => {
    calls.push(method)
    if (method === 'lookupBlock') return { seqno: q!.unixtime === FROM ? fx.seqnoFrom : fx.seqnoTo } as T
    if (method === 'getShardAccountCell') return { bytes: q!.seqno === fx.seqnoFrom ? fx.shardFrom : fx.shardTo } as T
    throw new Error(method)
  }
  const v3: V3Fetch = async <T>(path: string, q?: Record<string, unknown>) => {
    calls.push(`${path}:${q!.start_lt}-${q!.end_lt}`)
    return { transactions: txs } as T
  }
  return { v2, v3, calls }
}

describe('balanceDiff (mainnet vectors)', () => {
  it('matches tonapi\'s balance_change and reconciles every transaction', async () => {
    const { v2, v3, calls } = fakeApis()
    const d = await balanceDiff(v2, v3, ADDR, FROM, TO, { now: 1792687000 })
    expect(d.start.balance).toBe(191511613726n)
    expect(d.end.balance).toBe(35370954671n)
    expect(d.change).toBe(-156140659055n) // tonapi /diff
    expect(d.reconciled).toBe(true)
    expect(d.txCount).toBe(20)
    expect(d.received - d.sent - d.fees).toBe(d.change)
    // transactions are requested strictly after the start state's last tx, up to the end state's last tx
    expect(calls).toContain('transactions:103006849000015-109068814000013')
    expect(d.days.reduce((s, r) => s + r.change, 0n)).toBe(d.change)
    expect(d.days.at(-1)!.balance).toBe(d.end.balance)
    expect(percentChange(d)).toBe('−81.53%')
  })

  it('per-tx delta equals toncenter\'s before/after balances wherever the indexer has them', () => {
    // raw v3 rows (not trimmed) carry account_state_before/after; check a few recorded pairs from tx88 sample:
    // lt 111675696000029: before/after recorded balances differ by in − out − total_fees − out fwd_fee.
    const tx: V3Transaction = {
      account: ADDR, hash: '', lt: '1', now: 0, total_fees: '469092', orig_status: 'active', end_status: 'active', mc_block_seqno: 0,
      in_msg: { source: null, destination: ADDR, value: null, fwd_fee: null },
      out_msgs: [{ source: ADDR, destination: 'x', value: '90000000000', fwd_fee: '44446' }]
    }
    expect(txBalanceDelta(tx)).toBe(-(90000000000n + 469092n + 44446n))
  })

  it('no transactions in range: one balance for both ends', () => {
    const p = { time: 1, status: 'active' as const, balance: 5n, lastTxLt: '7' }
    const d = summarize(p, { ...p, time: 2 }, [], false)
    expect(d.change).toBe(0n)
    expect(d.reconciled).toBe(true)
    expect(d.series).toHaveLength(2)
  })

  it('truncated loads do not claim reconciliation', () => {
    const p = { time: 1, status: 'active' as const, balance: 191511613726n, lastTxLt: '0' }
    const d = summarize(p, { ...p, balance: 35370954671n }, txs.slice(0, 5), true)
    expect(d.reconciled).toBeNull()
    expect(d.change).toBe(-156140659055n)
  })

  it('rejects an inverted range and formats days', async () => {
    const { v2, v3 } = fakeApis()
    await expect(balanceDiff(v2, v3, ADDR, TO, FROM)).rejects.toThrow(/after the start/)
    expect(dayKey(FROM)).toMatch(/^20(26-09-30|26-10-01)$/)
    expect(percentChange({ start: { balance: 0n } as never, change: 1n })).toBeNull()
  })
})

describe('date range and chart', () => {
  it('covers whole local days and caps at now', () => {
    const r = dateRange('2026-10-01', '2026-10-14', 9_999_999_999)!
    expect(r.to - r.from).toBe(14 * 86400)
    expect(new Date(r.from * 1000).getHours()).toBe(0)
    expect(dateRange('2026-10-01', '2026-10-30', r.from + 100)!.to).toBe(r.from + 100)
    expect(dateRange('2026-10-05', '2026-10-01')).toBeNull()
    expect(dateRange('', '2026-10-01')).toBeNull()
  })

  it('draws a step line spanning the box', () => {
    const p = stepPath([{ time: 0, balance: 10n }, { time: 5, balance: 0n }, { time: 10, balance: 10n }], 100, 50)
    expect(p.d).toBe('M0.0,0.0H50.0V50.0H100.0V0.0')
    expect(p.min).toBe(0n)
    expect(p.max).toBe(10n)
    expect(stepPath([{ time: 0, balance: 1n }], 100, 50).d).toBe('M0.0,25.0')
  })
})
