import { beginCell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { V2Fetch, V3Fetch } from '~/utils/api-client'
import { parseShardAccount } from '~/lib/accounts-history/state'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { detectWalletVersion } from '~/utils/ton/wallets'
import d5f4 from './fixtures/d5f4.json'
import e250 from './fixtures/e250.json'
import {
  cellStats, checkStateInit, findFreeze, GAS_RESERVE, MAX_STATE_INIT_BYTES, parseConfig18, parseManualState, readDryRun,
  recoverAt, storageFee, unfreezeCost, unfreezeDestination, unfreezeMessage
} from './logic'

// Fixtures: real frozen mainnet accounts from TON Core's list (github.com/ton-blockchain/unfreezer, frozen-accounts.csv),
// toncenter responses recorded 2026-10-22, keyed by request path (transactions trimmed to the fields we read).
//   e250: -1:E250…4313, a Wallet v3R2 on the masterchain frozen in 2022 (toncenter v3: tx lt 25162894000001
//         orig_status active -> end_status frozen, mc block 18036520).
//   d5f4: 0:D5F4…D991, a contract with 100+ frozen->frozen spam transactions after the freeze
//         (toncenter v3: tx lt 54621854000001 active -> frozen, mc block 45539406).
type Rec = { address: string, log: Record<string, any>, config18: string }

function apis(rec: Rec) {
  const calls: string[] = []
  const key = (base: string, q?: Record<string, unknown>) =>
    `${base}?${new URLSearchParams(Object.entries(q ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`
  const v2: V2Fetch = async <T>(method: string, q?: Record<string, unknown>) => {
    const k = key(`/v2/${method}`, q)
    calls.push(k)
    if (!(k in rec.log)) throw new Error(`unrecorded ${k}`)
    return rec.log[k].result as T
  }
  const v3: V3Fetch = async <T>(path: string, q?: Record<string, unknown>) => {
    const k = key(`/v3/${path}`, q)
    calls.push(k)
    if (!(k in rec.log)) throw new Error(`unrecorded ${k}`)
    return rec.log[k] as T
  }
  return { v2, v3, calls }
}

const NOW = 1792698530 // time of the recording
const frozenState = (rec: Rec) => rec.log[`/v2/getShardAccountCell?address=${encodeURIComponent(rec.address)}`].result.bytes as string

describe('frozen wallet -1:E250… (v3R2, masterchain)', () => {
  const rec = e250 as Rec
  const now = parseShardAccount(frozenState(rec))

  it('reads the frozen state', () => {
    expect(now.status).toBe('frozen')
    // tonapi /v2/accounts/-1:E250…: status "frozen", balance 98871523394 (also in TON Core's CSV)
    expect(now.balance).toBe(98871523394n)
    expect(now.storage!.duePayment).toBe(0n)
  })

  it('finds the freeze, recovers the pre-freeze StateInit and its hash equals frozen_hash', async () => {
    const { v2, v3 } = apis(rec)
    const f = (await findFreeze(v3, rec.address, now.stateHash!))!
    expect(f.freezeTx.lt).toBe('25162894000001')
    expect(f.stateBlock).toBe(18036519)
    expect(f.requests).toBe(1)
    const r = (await recoverAt(v2, rec.address, f.stateBlock, now.stateHash!))!
    expect(r.matches).toBe(true)
    expect(r.hash).toBe(now.stateHash)
    expect(r.bytes).toBeLessThan(MAX_STATE_INIT_BYTES)
    // toncenter v3 account_state_before of the freeze tx: code_hash hNr6RJ… = Wallet v3R2
    expect(detectWalletVersion(r.stateInit.code!.hash().toString('hex'))?.version).toBe('v3r2')
  })

  it('a changed data cell does not match', async () => {
    const { v2 } = apis(rec)
    const r = (await recoverAt(v2, rec.address, 18036519, now.stateHash!))!
    const other = checkStateInit({ code: r.stateInit.code, data: beginCell().storeUint(1, 32).endCell() }, now.stateHash!)
    expect(other.matches).toBe(false)
  })

  it('unfreezes in the TVM emulator with the computed amount, sent non-bounceable', async () => {
    const { v2 } = apis(rec)
    const r = (await recoverAt(v2, rec.address, 18036519, now.stateHash!))!
    const prices = parseConfig18(rec.config18, NOW)
    const cost = unfreezeCost(now, r.cell, prices, { masterchain: true, months: 0, now: NOW })
    // balance (98.87) covers the tiny debt, so only the gas reserve is attached
    expect(cost.amount).toBe(GAS_RESERVE)
    const dest = unfreezeDestination(rec.address, false)
    expect(dest.startsWith('Uf')).toBe(true) // non-bounceable masterchain form
    const msg = unfreezeMessage('0:4DEA0F65A881F6227190C0AE2FBF91FB2ACB69C05050FA015B9617C55ACCB17C', dest, cost.amount, r.stateInit, NOW)
    const res = await sandboxHandlers.runTransaction({
      shardAccount: frozenState(rec), message: msg.toBoc().toString('base64'), now: NOW, lt: (BigInt(now.lastTxLt) + 1000n).toString()
    })
    const out = readDryRun(res as never)
    expect(out.status).toBe('active')
    expect(out.codeHash).toBe(r.stateInit.code!.hash().toString('hex'))
    expect(out.duePayment).toBe(0n)

    // The same message with a wrong StateInit leaves it frozen.
    const bad = unfreezeMessage('0:4DEA0F65A881F6227190C0AE2FBF91FB2ACB69C05050FA015B9617C55ACCB17C', dest, cost.amount, { code: r.stateInit.code, data: beginCell().endCell() }, NOW)
    const res2 = await sandboxHandlers.runTransaction({
      shardAccount: frozenState(rec), message: bad.toBoc().toString('base64'), now: NOW, lt: (BigInt(now.lastTxLt) + 1000n).toString()
    })
    expect(readDryRun(res2 as never).status).toBe('frozen')
  }, 60_000)
})

describe('frozen contract 0:D5F4… (freeze buried under spam)', () => {
  it('binary-searches the history to the active -> frozen transaction', async () => {
    const rec = d5f4 as Rec
    const s = parseShardAccount(frozenState(rec))
    expect(s.status).toBe('frozen')
    const { v3 } = apis(rec)
    const steps: string[] = []
    const f = (await findFreeze(v3, rec.address, s.stateHash!, t => steps.push(t)))!
    expect(f.freezeTx.lt).toBe('54621854000001')
    expect(f.freezeTx.orig_status).toBe('active')
    expect(f.stateBlock).toBe(45539405)
    expect(f.requests).toBeLessThan(20)
    expect(steps.some(t => t.includes('step'))).toBe(true)
  })
})

describe('fees', () => {
  it('parses config 18 and picks the entry in force', () => {
    // tonapi /v2/blockchain/config param 18: [{since 0: 1, 500, 1000, 500000}, {since 1777500000: 0, 135, 1000, 500000}]
    expect(parseConfig18(e250.config18, NOW)).toEqual({ bit: 0n, cell: 135n, mcBit: 1000n, mcCell: 500000n })
    expect(parseConfig18(e250.config18, 1777499999)).toEqual({ bit: 1n, cell: 500n, mcBit: 1000n, mcCell: 500000n })
  })

  it('storage fee math (vectors from TON Core unfreezer fees.test.ts)', () => {
    const p = { bit: 1n, cell: 500n, mcBit: 1000n, mcCell: 500000n }
    expect(storageFee(p, 65536, false, 1n, 0n)).toBe(500n)
    expect(storageFee(p, 65536, true, 1n, 0n)).toBe(500000n)
    expect(storageFee(p, 65536, false, 3n, 1000n)).toBe(3n * 500n + 1000n)
    expect(storageFee(p, 1, false, 1n, 1n)).toBe(1n)
    expect(storageFee(p, 65536, false, 0n, 0n)).toBe(0n)
  })

  it('counts unique cells', () => {
    const leaf = beginCell().storeUint(0, 16).endCell()
    const root = beginCell().storeUint(0, 32).storeRef(leaf).storeRef(leaf).endCell()
    expect(cellStats(root)).toEqual({ cells: 2n, bits: 48n })
  })

  it('charges the shortfall when the balance does not cover the debt', () => {
    const p = { bit: 1n, cell: 500n, mcBit: 1000n, mcCell: 500000n }
    const cell = beginCell().storeUint(0, 32).endCell()
    const c = unfreezeCost({ balance: 0n, storage: { cells: 1n, bits: 0n, lastPaid: 0, duePayment: 200000000n } }, cell, p, { masterchain: false, months: 2, now: 65536 })
    expect(c.debt).toBe(200000000n + 500n)
    expect(c.amount).toBe(c.debt + c.rent + GAS_RESERVE)
  })
})

describe('manual StateInit', () => {
  it('accepts a StateInit BOC or code + data', () => {
    const code = beginCell().storeUint(7, 8).endCell()
    const data = beginCell().storeUint(9, 8).endCell()
    const si = parseManualState('', code.toBoc().toString('base64'), data.toBoc().toString('hex'))
    expect(si.code!.equals(code)).toBe(true)
    expect(si.data!.equals(data)).toBe(true)
    expect(() => parseManualState('', 'zz', '')).toThrow(/both/)
    expect(() => parseManualState('nope', '', '')).toThrow(/not a valid BOC/)
  })
})
