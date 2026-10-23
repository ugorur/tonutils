import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { detectWalletVersion } from '~/utils/ton/wallets'
import { buildMsgInner, fromQueryId, fromSeqno, fromShiftAndBit, HIGHLOAD_V3_CODE, highloadV3Address, highloadV3Init, MAX_QUERY_ID, nextQueryId, packTransfers, parseBatch, parseSignature, signedExternal } from './logic'

describe('highload v3 code', () => {
  // Code hash from build/HighloadWalletV3.compiled.json and toncenter code_hash of live accounts.
  it('hashes to the published code hash', () => {
    expect(HIGHLOAD_V3_CODE.hash().toString('hex')).toBe('11acad7955844090f283bf238bc1449871f783e7cc0979408d3f4859483e8525')
    expect(detectWalletVersion(HIGHLOAD_V3_CODE.hash().toString('base64'))?.version).toBe('highload-v3')
  })
})

describe('highloadV3Address', () => {
  // Live mainnet highload v3 wallets (toncenter /api/v3/account, data fields read with the get-methods
  // get_public_key / get_subwallet_id / get_timeout): recomputing the init state must give the same address.
  it.each([
    ['0:F2DC1860686CD658987E2BED8216532D8C004460DADEA907CC7D4AD7236C496B', 'cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5', 4269, 7200],
    ['0:7F97F36DDA3F7DEDC9E12F8C09C4F89E7FBC17527AB3F67DE4C3B155297A56E4', 'ef7bd8c4b3d71c9eb8fadd48524287718facfc85cf271a052cb2cda06c3aceca', 4269, 7200],
    ['0:5E69BEC3DFC448C32A5E81B37B619810CF00DB6FC41F30CC18F28B89737A8F97', 'a74661e5ee29cba23bc1fa601a631499d5333f7affe290a6be7a15e011567e7e', 1, 300]
  ])('%s', (raw, publicKey, subwalletId, timeout) => {
    expect(highloadV3Address({ publicKey, subwalletId, timeout }).equals(Address.parse(raw))).toBe(true)
  })
  it('accepts hex subwallet and rejects bad input', () => {
    const a = highloadV3Address({ publicKey: 'cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5', subwalletId: '0x10ad', timeout: '7200' })
    expect(a.equals(Address.parse('0:F2DC1860686CD658987E2BED8216532D8C004460DADEA907CC7D4AD7236C496B'))).toBe(true)
    expect(() => highloadV3Address({ publicKey: 'abc', subwalletId: 1, timeout: 1 })).toThrow(/32 bytes/)
    expect(() => highloadV3Address({ publicKey: 'cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5', subwalletId: 1, timeout: 2 ** 22 })).toThrow(/Timeout/)
    expect(() => highloadV3Address({ publicKey: 'cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5', subwalletId: 1, timeout: 0 })).toThrow(/Timeout/)
  })
})

describe('query ids', () => {
  // tests/imports/const.ts: maxQueryId = (maxShift << 10) + 1022, maxShift = 8191.
  it('max query id', () => expect(MAX_QUERY_ID).toBe((8191 << 10) + 1022))
  // On-chain: 0:F2DC…496B has shift 408 bit 301 marked and processed?(418093) = -1.
  it('splits a query id into shift and bit number', () => {
    expect(fromQueryId(418093)).toEqual({ queryId: 418093, shift: 408, bitNumber: 301, seqno: 408 * 1023 + 301 })
    expect(fromShiftAndBit(408, 301).queryId).toBe(418093)
  })
  it('rejects bit 1023 like the contract', () => {
    expect(() => fromQueryId((5 << 10) + 1023)).toThrow(/1023/)
  })
  it('sequence numbers skip bit 1023', () => {
    expect(fromSeqno(1023)).toMatchObject({ shift: 1, bitNumber: 0, queryId: 1024 })
  })
  it('next id rolls over and keeps the emergency id', () => {
    expect(nextQueryId(fromShiftAndBit(0, 1022))).toMatchObject({ shift: 1, bitNumber: 0 })
    expect(nextQueryId(fromShiftAndBit(8191, 1020))).toMatchObject({ shift: 8191, bitNumber: 1021 })
    expect(nextQueryId(fromShiftAndBit(8191, 1021))).toBeNull()
  })
})

describe('batch builder against the real contract in @ton/sandbox', () => {
  // The official highload v3 code (hash checked above) runs our unsigned msg_inner, signed with a throwaway test key.
  async function setup() {
    const { Blockchain, internal: int } = await import('@ton/sandbox')
    const { keyPairFromSeed, sign } = await import('@ton/crypto')
    const { toNano } = await import('@ton/core')
    const kp = keyPairFromSeed(Buffer.alloc(32, 7))
    const bc = await Blockchain.create()
    bc.now = 1_800_000_000
    const cfg = { publicKey: kp.publicKey.toString('hex'), subwalletId: 4269, timeout: 3600 }
    const init = highloadV3Init(cfg)
    const wallet = highloadV3Address(cfg)
    const treasury = await bc.treasury('t')
    await bc.sendMessage(int({ from: treasury.address, to: wallet, value: toNano('1000'), bounce: false }))
    return { bc, kp, sign, toNano, init, wallet }
  }

  it('sends 300 transfers (254 + a chained batch) in one external, in order', async () => {
    const { bc, kp, sign, toNano, init, wallet } = await setup()
    const dests = Array.from({ length: 300 }, (_, i) => new Address(0, Buffer.alloc(32, (i % 250) + 1)))
    const transfers = dests.map((to, i) => ({ to, amount: toNano('0.01') + BigInt(i), bounce: false }))
    const inner = buildMsgInner(packTransfers(wallet, transfers, 5), { subwalletId: 4269, queryId: 5, createdAt: bc.now! - 10, timeout: 3600 })
    const ext = signedExternal(wallet, inner, sign(inner.hash(), kp.secretKey), init)
    const { loadMessage } = await import('@ton/core')
    const res = await bc.sendMessage(loadMessage(ext.beginParse()))
    const out = res.transactions.flatMap(t => t.outMessages.values()).filter(m => m.info.type === 'internal' && !m.info.dest.equals(wallet))
    expect(out).toHaveLength(300)
    out.forEach((m, i) => {
      if (m.info.type !== 'internal') throw new Error('unexpected')
      expect(m.info.dest.equals(dests[i]!)).toBe(true)
      expect(m.info.value.coins).toBe(toNano('0.01') + BigInt(i))
    })
    // Replaying the same external is rejected: the query id is now processed.
    await expect(bc.sendMessage(loadMessage(ext.beginParse()))).rejects.toThrow()
  })

  it('rejects a bad signature and parses batch text', async () => {
    const { bc, init, wallet, toNano } = await setup()
    const inner = buildMsgInner(packTransfers(wallet, [{ to: wallet, amount: toNano('1'), bounce: false }], 6), { subwalletId: 4269, queryId: 6, createdAt: bc.now! - 10, timeout: 3600 })
    const { loadMessage } = await import('@ton/core')
    await expect(bc.sendMessage(loadMessage(signedExternal(wallet, inner, Buffer.alloc(64, 1), init).beginParse()))).rejects.toThrow()
    const { transfers, errors } = parseBatch('EQDy3BhgaGzWWJh-K-2CFlMtjABEYNreqQfMfUrXI2xJa81w, 1.5, hi, there\n# note\nnope, 1', s => toNano(s))
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ amount: 1_500_000_000n, bounce: true })
    expect(errors).toHaveLength(1)
    expect(() => parseSignature('ab')).toThrow()
    expect(parseSignature('00'.repeat(64))).toHaveLength(64)
  })
})
