import type { MessageRelaxed, Slice } from '@ton/core'
import { Address, Cell, loadMessage, loadMessageRelaxed } from '@ton/core'
import { describe, expect, it } from 'vitest'
import txFx from '~/lib/tx-dev/fixtures/transactions.json'
import fx from './fixtures.json'
import { actionRows, explainEmulatorError, externalBoc, inspectExternal, summarizeTrace, transferMessage, unsignedTransferBody, walletFromState, type EmulateResponse } from './logic'

// Real mainnet wallets (toncenter v3 /account + /walletInformation) and real wallet transactions started by an
// external message (toncenter v2 getTransactions BOC). The builder must reproduce the exact signed part.
const VERSIONS = ['v3r2', 'v4r2', 'v5r1'] as const

/** The external message body of the fixture transaction. */
const extBody = (txRaw: string) => loadMessage(Cell.fromBase64(txRaw).refs[0]!.refs[0]!.beginParse()).body

/** Parses the on-chain body by TL-B (wallet sources), returning what the builder needs plus the signed part. */
function parseWalletBody(version: (typeof VERSIONS)[number], body: Cell) {
  const s = body.beginParse()
  const messages: { mode: number, msg: MessageRelaxed }[] = []
  if (version === 'v5r1') {
    // signed_request$_ op:0x7369676e wallet_id valid_until msg_seqno inner:InnerRequest signature:bits512 (signature at the tail)
    expect(s.loadUint(32)).toBe(0x7369676E)
    s.loadUint(32)
    const validUntil = s.loadUint(32)
    const seqno = s.loadUint(32)
    if (s.loadBit()) {
      // OutList: linked list of action_send_msg#0ec3c86d mode:(## 8) out_msg:^(MessageRelaxed Any)
      let node: Slice | null = s.loadRef().beginParse()
      const acc: typeof messages = []
      while (node && node.remainingRefs > 0) {
        const prev: Cell = node.loadRef()
        expect(node.loadUint(32)).toBe(0x0EC3C86D)
        acc.unshift({ mode: node.loadUint(8), msg: loadMessageRelaxed(node.loadRef().beginParse()) })
        node = prev.beginParse()
      }
      messages.push(...acc)
    }
    return { validUntil, seqno, messages }
  }
  s.skip(512)
  s.loadUint(32)
  const validUntil = s.loadUint(32)
  const seqno = s.loadUint(32)
  if (version === 'v4r2') expect(s.loadUint(8)).toBe(0) // simple send
  while (s.remainingRefs > 0) messages.push({ mode: s.loadUint(8), msg: loadMessageRelaxed(s.loadRef().beginParse()) })
  return { validUntil, seqno, messages }
}

/** Root bits covered by the signature (signature stripped), as a bit string. */
function signedRootBits(version: string, body: Cell): string {
  const s = body.beginParse()
  if (version !== 'v5r1') s.skip(512)
  return s.loadBits(version === 'v5r1' ? body.bits.length - 512 : s.remainingBits).toString()
}

/** Comparable view of an inner message: header fields plus the body cell hash (inline vs ref body is equivalent). */
const msgView = (m: MessageRelaxed) => ({
  ...m.info,
  dest: m.info.dest?.toString(),
  body: m.body.hash().toString('hex'),
  init: !!m.init
})

describe('walletFromState', () => {
  it.each(VERSIONS)('%s: seqno and wallet id match toncenter walletInformation', (v) => {
    const f = fx[v]
    const w = walletFromState(f.address, f.code, f.data)
    expect(w.version).toBe(v)
    expect(w.seqno).toBe(f.walletInformation!.seqno)
    expect(w.walletId).toBe(f.walletInformation!.wallet_id)
    expect(w.address.equals(Address.parse(f.address))).toBe(true)
  })

  it('accepts a funded v3R2 wallet whose address does not rebuild from its code + data (custom deployment)', () => {
    // toncenter v3 /account and /walletInformation (same last_transaction_lt 111828959000007), 2026-10-23
    const addr = 'EQCjk1hh952vWaE9bRguFkAhDAL5jj3xj9p0uPWrFBq_GEMS'
    const w = walletFromState(addr, fx.v3r2.code, 'te6ccgEBAQEAKgAAUAAAACspqaMXeFMWBTkvznPWzYwz6MYIKICIXmLZbe9Dp1kz2XjSSeo=')
    expect(w).toMatchObject({ version: 'v3r2', seqno: 43, walletId: 698983191 })
  })

  it('rejects non-wallets and undeployed accounts', () => {
    expect(() => walletFromState(fx.v4r2.address, null, null)).toThrow(/no deployed contract/)
    // a jetton wallet's code is not a wallet
    const someCode = Cell.fromBase64(fx.v3r2.data).toBoc().toString('base64')
    expect(() => walletFromState(fx.v4r2.address, someCode, fx.v4r2.data)).toThrow(/not a standard wallet/)
  })
})

describe('unsignedTransferBody reproduces real wallet messages', () => {
  it.each(VERSIONS)('%s: same signed bytes as the on-chain external message', async (v) => {
    const f = fx[v]
    const body = extBody(f.txRaw)
    const p = parseWalletBody(v, body)
    expect(p.messages.length).toBeGreaterThan(0)
    for (const m of p.messages) expect(m.mode).toBe(3)
    const w = walletFromState(f.address, f.code, f.data)
    const rebuilt = await unsignedTransferBody(w, { messages: p.messages.map(m => m.msg), validUntil: p.validUntil, seqno: p.seqno, network: 'mainnet' })
    expect(signedRootBits(v, rebuilt)).toBe(signedRootBits(v, body))
    const again = parseWalletBody(v, rebuilt)
    expect(again.messages.map(m => [m.mode, msgView(m.msg)])).toEqual(p.messages.map(m => [m.mode, msgView(m.msg)]))
    // signature slot is zero-filled
    const sig = v === 'v5r1' ? rebuilt.beginParse().skip(rebuilt.bits.length - 512).loadBuffer(64) : rebuilt.beginParse().loadBuffer(64)
    expect(sig.equals(Buffer.alloc(64))).toBe(true)
  })

  it('the external message round-trips through inspectExternal', async () => {
    const w = walletFromState(fx.v4r2.address, fx.v4r2.code, fx.v4r2.data)
    const body = await unsignedTransferBody(w, { messages: [transferMessage({ to: 'UQDhb9HjfIVe0V-hunPdShPwMq6yFV_PZdiYbRimFms8-O2a', amount: 10_000_000n, comment: 'hello' })], validUntil: 1792687500, network: 'mainnet' })
    const info = inspectExternal(externalBoc(w.address, body))
    expect(info.dest).toBe(fx.v4r2.address.toLowerCase())
    expect(info.hasInit).toBe(false)
  })
})

describe('transferMessage', () => {
  it('bounce follows the address flag; raw addresses are bounceable', () => {
    // same account (fx.v4r2), three spellings
    const info = (to: string) => transferMessage({ to, amount: 1n }).info as { bounce: boolean, dest: Address }
    expect(info('UQDhb9HjfIVe0V-hunPdShPwMq6yFV_PZdiYbRimFms8-O2a').bounce).toBe(false)
    expect(info('EQDhb9HjfIVe0V-hunPdShPwMq6yFV_PZdiYbRimFms8-LBf').bounce).toBe(true)
    const raw = info('0:e16fd1e37c855ed15fa1ba73dd4a13f032aeb2155fcf65d8986d18a6166b3cf8')
    expect(raw.bounce).toBe(true)
    expect(raw.dest.toRawString()).toBe(fx.v4r2.address.toLowerCase())
  })
})

describe('inspectExternal', () => {
  it('accepts the real external message of a v4 wallet transaction', () => {
    const msg = Cell.fromBase64(fx.v4r2.txRaw).refs[0]!.refs[0]!
    const info = inspectExternal(msg.toBoc().toString('base64'))
    // toncenter v3 in_msg.hash of tx Jg0+MZwY… is gZ12PWsK1Cr081bHXSJAazfRyVXux8dVK01dL1s2XUo=
    expect(Buffer.from(info.hash, 'hex').toString('base64')).toBe('gZ12PWsK1Cr081bHXSJAazfRyVXux8dVK01dL1s2XUo=')
    expect(info.dest).toBe('0:e16fd1e37c855ed15fa1ba73dd4a13f032aeb2155fcf65d8986d18a6166b3cf8')
  })

  it('explains bodies and internal messages instead of failing silently', () => {
    expect(() => inspectExternal('te6cckEBAQEACwAAEgAAAABoZWxsb5oNank=')).toThrow(/not a message/)
    // inbound internal message of a real transaction
    const internalMsg = Cell.fromBase64(txFx.bounced.raw).refs[0]!.refs[0]!
    expect(() => inspectExternal(internalMsg.toBoc().toString('base64'))).toThrow(/internal message/)
  })
})

describe('summarizeTrace (real toncenter emulateTrace response)', () => {
  const r = fx.emulateTrace as unknown as EmulateResponse
  it('walks the trace tree in order and sums balance changes per account', () => {
    const s = summarizeTrace(r)
    expect(s.rows.map(x => [x.tx.hash, x.depth])).toEqual([
      ['iPbU+/d8Ak7eA8qzOoq5CpVlLQ+NfWhxVmz7sLZPHM0=', 0],
      ['dU6jAa8sIgARQxrlACgQaR5Mfgo/MNIVXtOBDeDqgoc=', 1]
    ])
    expect(s.ok).toBe(true)
    // both transactions are on the same wallet (sent 0.01 to itself): sum of after - before of each tx
    const expected = Object.values(r.transactions).reduce((acc, t) => acc + BigInt(t.account_state_after!.balance!) - BigInt(t.account_state_before!.balance!), 0n)
    expect(s.balances).toEqual([{ account: '0:e16fd1e37c855ed15fa1ba73dd4a13f032aeb2155fcf65d8986d18a6166b3cf8', delta: expected }])
    expect(s.totalFees).toBe(Object.values(r.transactions).reduce((a, t) => a + BigInt(t.total_fees), 0n))
    expect(s.rows[1]!.tx.inMsg?.decoded?.fields).toMatchObject({ text: 'hello' })
  })

  it('explains rejected externals with the wallet exit code', () => {
    // real toncenter error for an expired v4 message
    expect(explainEmulatorError('failed to emulate shard block: EmulationExternalNotAccepted: 36', 'v4r2')).toMatch(/exit code 36: Wallet: message expired/)
    // real toncenter error for a v3R2 wallet holding 42657 nanoGRAM (too little to pay for the external's gas)
    expect(explainEmulatorError('failed to emulate shard block: cannot run message on account inbound external message rejected by account 0370CEE3FB0E12CC87F2574EFEA5765071C6E26C47018B87306465E7F2329EE8 before smart-contract execution')).toMatch(/balance cannot pay for the gas/)
  })
})

describe('actionRows (real toncenter action)', () => {
  it('splits addresses, nanoGRAM values and text', () => {
    const a = (fx.emulateTrace as unknown as EmulateResponse).actions![0]!
    expect(a.type).toBe('ton_transfer')
    const rows = actionRows(a.details)
    expect(rows).toContainEqual({ label: 'source', kind: 'address', value: '0:E16FD1E37C855ED15FA1BA73DD4A13F032AEB2155FCF65D8986D18A6166B3CF8' })
    expect(rows).toContainEqual({ label: 'value', kind: 'coin', value: '10000000' })
    expect(rows).toContainEqual({ label: 'comment', kind: 'text', value: 'hello' })
    expect(rows.find(r => r.label.includes('extra'))).toBeUndefined()
  })
})
