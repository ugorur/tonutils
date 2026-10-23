import { Address, beginCell, Cell, loadStateInit } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { HMSTR_JETTON_WALLET_DEPLOY as JW, WALLET_V4R2_DEPLOY as W4 } from './examples'
import { buildStateInit, decodeStateInit, libraryRefCell, tonConnectMessage } from './logic'

const b64hex = (b64: string) => Buffer.from(b64, 'base64').toString('hex')
// HMSTR master get_jetton_data jetton_wallet_code (toncenter /api/v3/runGetMethod, 2026-10-22): a library cell.
const HMSTR_WALLET_CODE = 'te6cckEBAQEAIwAIQgIPGtPYpGvSgzId3mORlftyYC6bMbFyf+zCXi7cEJZt9Ei8le0='
const HMSTR_LIB = '0f1ad3d8a46bd283321dde639195fb72602e9b31b1727fecc25e2edc10966df4' // bytes 1..32 of that cell

describe('decodeStateInit: real mainnet deploys', () => {
  it('wallet v4R2 StateInit → address, wallet version and public key', () => {
    const r = decodeStateInit(W4.stateInit)
    expect(r.source).toBe('stateinit')
    expect(r.hash).toBe(b64hex(W4.initHash))
    expect(r.address.nonBounceable).toBe(W4.address)
    expect(Address.parse(r.address.bounceable).equals(Address.parse(W4.address))).toBe(true)
    expect(r.code?.wallet).toBe('Wallet v4R2')
    expect(r.walletData).toEqual({ seqno: 0, walletId: 698983191, publicKey: W4.publicKey })
    expect(r.fixedPrefixLength).toBeNull()
    expect(r.special).toBeNull()
    expect(r.libraries).toEqual([])
  })

  it('reads the StateInit out of the signed external deploy message', () => {
    const r = decodeStateInit(W4.message)
    expect(r.source).toBe('external message')
    expect(r.hash).toBe(b64hex(W4.initHash))
    expect(r.destination).toBe(r.address.raw)
  })

  it('jetton wallet deploy (internal message): code is a library reference', () => {
    const r = decodeStateInit(JW.message)
    expect(r.source).toBe('internal message')
    expect(r.hash).toBe(b64hex(JW.initHash))
    expect(r.address.raw).toBe(JW.address)
    expect(r.destination).toBe(JW.address)
    expect(r.code?.library).toBe(HMSTR_LIB)
    expect(r.code?.wallet).toBeUndefined()
    expect(decodeStateInit(JW.stateInit).hash).toBe(r.hash)
  })

  it('explains non-StateInit input', () => {
    expect(() => decodeStateInit(HMSTR_WALLET_CODE)).toThrow(/neither a StateInit nor a message/)
    expect(() => decodeStateInit('not a boc!')).toThrow(/base64/)
    const plain = beginCell().storeUint(0b10, 2).storeUint(0, 2).storeAddress(Address.parse(W4.address)).storeCoins(0).storeBit(0).storeBit(0).endCell()
    expect(() => decodeStateInit(plain.toBoc().toString('base64'))).toThrow(/no StateInit/)
  })
})

describe('buildStateInit', () => {
  const w4 = loadStateInit(Cell.fromBase64(W4.stateInit).beginParse())
  const jw = loadStateInit(Cell.fromBase64(JW.stateInit).beginParse())

  it('rebuilds the on-chain wallet StateInit from code + data', () => {
    const r = buildStateInit({ code: w4.code!.toBoc().toString('base64'), data: w4.data!.toBoc().toString('hex') })
    expect(r.hash).toBe(b64hex(W4.initHash))
    expect(r.address.nonBounceable).toBe(W4.address)
    // Blueprint build output ({"hex": …}) works too
    const bp = buildStateInit({ code: JSON.stringify({ hash: 'x', hex: w4.code!.toBoc().toString('hex') }), data: w4.data!.toBoc().toString('base64') })
    expect(bp.hash).toBe(r.hash)
  })

  it('builds the library code cell from the hash, matching the jetton master and the deploy', () => {
    expect(libraryRefCell(HMSTR_LIB).equals(Cell.fromBase64(HMSTR_WALLET_CODE))).toBe(true)
    const r = buildStateInit({ code: HMSTR_LIB, codeIsLibrary: true, data: jw.data!.toBoc().toString('base64') })
    expect(r.hash).toBe(b64hex(JW.initHash))
    expect(r.address.raw).toBe(JW.address)
  })

  it('encodes fixed_prefix_length, tick/tock and libraries per TL-B and reads them back', () => {
    const lib = beginCell().storeUint(0xdeadbeef, 32).endCell()
    const r = buildStateInit({
      code: w4.code!.toBoc().toString('base64'),
      data: '',
      fixedPrefixLength: 8,
      tick: true,
      libraries: [{ boc: lib.toBoc().toString('base64'), public: true }],
      workchain: -1
    })
    // split_depth: 1 + 01000, special: 1 + tick 1 + tock 0, code: 1 (ref), data: 0, library: 1 (ref)
    const cell = Cell.fromBase64(r.boc)
    const bits = [...Array(cell.bits.length)].map((_, i) => cell.bits.at(i) ? 1 : 0).join('')
    expect(bits).toBe('101000' + '110' + '1' + '0' + '1')
    expect(r.workchain).toBe(-1)
    expect(r.address.raw.startsWith('-1:')).toBe(true)
    const back = decodeStateInit(r.boc, -1)
    expect(back.fixedPrefixLength).toBe(8)
    expect(back.special).toEqual({ tick: true, tock: false })
    expect(back.data).toBeNull()
    expect(back.libraries).toEqual([{ hash: lib.hash().toString('hex'), public: true, boc: lib.toBoc().toString('base64') }])
    expect(back.hash).toBe(r.hash)
  })

  it('validates input', () => {
    expect(() => buildStateInit({ code: '', data: '' })).toThrow(/needs code/)
    expect(() => buildStateInit({ code: HMSTR_LIB, codeIsLibrary: true, data: '', fixedPrefixLength: 32 })).toThrow(/0 to 31/)
    expect(() => buildStateInit({ code: HMSTR_LIB, codeIsLibrary: true, data: '', workchain: 1 })).toThrow(/Workchain/)
    expect(() => buildStateInit({ code: 'nothex', codeIsLibrary: true, data: '' })).toThrow(/Hash/)
  })

  it('makes a TonConnect deploy message for the right network', () => {
    const r = buildStateInit({ code: w4.code!.toBoc().toString('base64'), data: w4.data!.toBoc().toString('base64') })
    expect(tonConnectMessage(r, '50000000')).toEqual({ address: r.address.bounceable, amount: '50000000', stateInit: r.boc })
    expect(tonConnectMessage(r, '1', true).address).toBe(r.address.testnetBounceable)
  })
})
