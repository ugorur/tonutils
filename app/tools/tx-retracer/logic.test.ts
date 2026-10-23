import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import fx from '~/lib/tx-dev/fixtures/transactions.json'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import cfg from './fixtures/config-100678679.json'
import { fetchRetraceInputs, libraryHashes, libsDict, neededLibraries, parseVmLog, replayPlan, retrace, splitStack, stateCode, stateLt, type RawTx } from './logic'

// Real mainnet data (see app/lib/tx-dev/fixtures/transactions.json _source): account state from toncenter v2
// getShardAccountCell at the masterchain block before the transaction, raw transaction BOCs from v2
// getTransactions, config from v2 getConfigAll at the transaction's masterchain block, libraries from v2
// getLibraries. The expected result is the on-chain transaction itself: the re-run must produce the same hash.
const run = sandboxHandlers.runTransaction

describe('retrace (real mainnet transactions, bit-exact)', () => {
  it('wallet v4 external message: same hash, 68 VM steps, gas 3308 as on chain', async () => {
    const c = fx.walletV4
    expect(stateLt(c.stateBefore)).toBe(BigInt(c.v3.prev_trans_lt))
    const r = await retrace({ state: c.stateBefore, txs: [c.raw], config: cfg.config }, run)
    expect(r.match).toBe(true)
    expect(r.emulatedHash).toBe(Buffer.from(c.v3.hash, 'base64').toString('hex'))
    const steps = parseVmLog(r.vmLog, 0 + Number(c.v3.description.compute_ph.gas_credit))
    expect(steps).toHaveLength(c.v3.description.compute_ph.vm_steps)
    expect(steps.at(-1)!.gasUsed).toBe(Number(c.v3.description.compute_ph.gas_used))
    expect(steps[0]).toMatchObject({ n: 1, instr: 'SETCP 0', offset: 0, cost: 26 })
    // ACCEPT raises the limit from the 10000 external credit to the 1M max
    expect(steps.some(s => s.notes.includes('changing gas limit to 1000000'))).toBe(true)
    expect(steps.reduce((a, s) => a + s.cost, 0)).toBe(3308)
  }, 60_000)

  it('second transaction in the same block: replays the first one, then matches', async () => {
    const snap = stateLt(fx.walletV4.stateBefore)
    const fetched: RawTx[] = [fx.walletV4Excess, fx.walletV4].map(c => ({ lt: BigInt(c.v3.lt), raw: c.raw }))
    const txs = replayPlan(fetched, snap, BigInt(fx.walletV4Excess.v3.lt))
    expect(txs).toEqual([fx.walletV4.raw, fx.walletV4Excess.raw])
    const r = await retrace({ state: fx.walletV4.stateBefore, txs, config: cfg.config }, run)
    expect(r).toMatchObject({ match: true, replayed: 1, replayMismatches: 0 })
    expect(r.emulatedHash).toBe(Buffer.from(fx.walletV4Excess.v3.hash, 'base64').toString('hex'))
    // running it on the stale snapshot alone gives a different transaction
    const stale = await retrace({ state: fx.walletV4.stateBefore, txs: [fx.walletV4Excess.raw], config: cfg.config }, run)
    expect(stale.match).toBe(false)
  }, 60_000)

  it('USDT jetton wallet with library code: finds the library, matches with it', async () => {
    const c = fx.jettonWalletLib
    const needed = neededLibraries(c.stateBefore, [c.raw])
    expect(needed).toEqual([Buffer.from(c.libraries[0]!.hash, 'base64').toString('hex')])
    expect(stateCode(c.stateBefore)!.isExotic).toBe(true)
    const r = await retrace({ state: c.stateBefore, txs: [c.raw], config: cfg.config, libs: libsDict(c.libraries) }, run)
    expect(r.match).toBe(true)
    expect(r.tx.compute).toMatchObject({ skipped: false, success: true, vmSteps: c.v3.description.compute_ph.vm_steps })
  }, 60_000)

  it('replayPlan refuses gaps', () => {
    expect(() => replayPlan([{ lt: BigInt(fx.walletV4Excess.v3.lt), raw: fx.walletV4Excess.raw }], stateLt(fx.walletV4.stateBefore), BigInt(fx.walletV4Excess.v3.lt))).toThrow(/every transaction/)
  })
})

describe('fetchRetraceInputs (toncenter call sequence)', () => {
  // Serves the real fixture data the way toncenter does, for the second transaction of the block.
  const all = [fx.walletV4Excess, fx.walletV4]
  const calls: string[] = []
  const tc = {
    async v3<T>(_p: string, q: Record<string, unknown> = {}) {
      calls.push(_p)
      return { transactions: all.filter(c => c.v3.hash === q.hash).map(c => c.v3) } as T
    },
    async v2<T>(m: string, q: Record<string, unknown> = {}) {
      calls.push(m)
      if (m === 'getShardAccountCell') {
        expect(q.seqno).toBe(fx.walletV4.v3.mc_block_seqno - 1)
        return { bytes: fx.walletV4.stateBefore } as T
      }
      if (m === 'getTransactions') {
        expect(q).toMatchObject({ lt: fx.walletV4Excess.v3.lt, hash: fx.walletV4Excess.v3.hash, limit: 16 })
        return all.map(c => ({ transaction_id: { lt: c.v3.lt, hash: c.v3.hash }, data: c.raw })) as T
      }
      if (m === 'getConfigAll') return { config: { bytes: cfg.config } } as T
      throw new Error(m)
    }
  }

  it('collects state, both transactions and config; no libraries for a wallet', async () => {
    const f = await fetchRetraceInputs(tc, fx.walletV4Excess.v3.hash, 'mainnet')
    expect(calls).toEqual(['transactions', 'getShardAccountCell', 'getTransactions', 'getConfigAll'])
    expect(f.txs).toEqual([fx.walletV4.raw, fx.walletV4Excess.raw])
    expect(f.libs).toBeUndefined()
    expect(f.mcSeqno).toBe(100678679)
    const r = await retrace(f, run)
    expect(r.match).toBe(true)
  }, 60_000)
})

describe('helpers', () => {
  it('splitStack keeps nested tuples and cell slices whole', () => {
    expect(splitStack('[ 5496568712078 0 C{819D} CS{Cell{019c} bits: 0..624; refs: 0..1} -1 [ 1 (null) ] ] ')).toEqual([
      '5496568712078', '0', 'C{819D}', 'CS{Cell{019c} bits: 0..624; refs: 0..1}', '-1', '[ 1 (null) ]'
    ])
    expect(splitStack('[ ]')).toEqual([])
  })

  it('libraryHashes finds no libraries in ordinary code', () => {
    expect(libraryHashes([stateCode(fx.walletV4.stateBefore)])).toEqual([])
    expect(libraryHashes([Cell.EMPTY, null])).toEqual([])
  })
})
