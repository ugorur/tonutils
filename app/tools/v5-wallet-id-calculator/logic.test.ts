import { beginCell } from '@ton/core'
import { loadWalletIdV5R1, storeWalletIdV5R1 } from '@ton/ton/dist/wallets/v5r1/WalletV5R1WalletId'
import { describe, expect, it } from 'vitest'
import { decodeContext, defaultSubwalletId, isStandardContext, parseWalletId, v4Address, v5Address, v5WalletId, walletIdForms } from './logic'

const pk = (hex: string) => Buffer.from(hex, 'hex')

describe('v5WalletId', () => {
  // Values documented in @ton/ton src/wallets/v5r1/WalletV5R1WalletId.ts.
  it.each([
    [-239, 0, 2147483409],
    [-239, -1, 8388369],
    [-3, 0, 2147483645],
    [-3, -1, 8388605]
  ])('global id %i, workchain %i -> %i', (gid, wc, expected) => {
    expect(v5WalletId(gid, wc, 0) >>> 0).toBe(expected)
  })

  it('matches live wallets: toncenter v3 walletStates wallet_id', () => {
    // mainnet 0:0c8c0fb5…36f1 and testnet 0:e5958798…315d are active W5 wallets (read 2026-10-22).
    expect(v5WalletId('mainnet') >>> 0).toBe(2147483409)
    expect(v5WalletId('testnet') >>> 0).toBe(2147483645)
  })

  it('agrees with @ton/ton storeWalletIdV5R1 / loadWalletIdV5R1 across subwallets', () => {
    for (const gid of [-239, -3]) {
      for (const wc of [0, -1]) {
        for (const sub of [0, 1, 2, 77, 32767]) {
          const ours = v5WalletId(gid, wc, sub)
          const lib = beginCell().store(storeWalletIdV5R1({ networkGlobalId: gid, context: { walletVersion: 'v5r1', workchain: wc, subwalletNumber: sub } })).endCell().beginParse().loadInt(32)
          expect(ours).toBe(lib)
          const back = loadWalletIdV5R1(BigInt(ours >>> 0), gid)
          expect(decodeContext(ours, gid)).toEqual({ kind: 'client', workchain: wc, walletVersion: 0, subwallet: sub })
          expect(back.context).toEqual({ walletVersion: 'v5r1', workchain: wc, subwalletNumber: sub })
        }
      }
    }
  })
})

describe('decodeContext', () => {
  it('reads the mainnet default; the same number is a different subwallet on testnet', () => {
    const main = decodeContext(2147483409, -239)
    expect(main).toEqual({ kind: 'client', workchain: 0, walletVersion: 0, subwallet: 0 })
    expect(isStandardContext(main)).toBe(true)
    // -239 and -3 differ only in the low byte, so the network cannot be told from the wallet_id alone.
    expect(decodeContext(2147483409, -3)).toEqual({ kind: 'client', workchain: 0, walletVersion: 0, subwallet: 236 })
    expect(v5WalletId(-3, 0, 236)).toBe(2147483409)
  })

  it('decodes a custom (back-office) context', () => {
    const lib = beginCell().store(storeWalletIdV5R1({ networkGlobalId: -239, context: 12345 })).endCell().beginParse().loadInt(32)
    expect(decodeContext(lib, -239)).toEqual({ kind: 'custom', counter: 12345 })
  })
})

describe('parseWalletId / walletIdForms', () => {
  it('accepts unsigned, signed and hex', () => {
    expect(walletIdForms(parseWalletId('2147483409'))).toEqual({ signed: 2147483409, unsigned: 2147483409, hex: '0x7fffff11' })
    expect(parseWalletId('0x7FFFFF11')).toBe(2147483409)
    expect(parseWalletId('4294967057')).toBe(-239)
    expect(parseWalletId('-239')).toBe(-239)
    expect(() => parseWalletId('abc')).toThrow()
    expect(() => parseWalletId('4294967296')).toThrow()
  })
})

describe('addresses (on-chain vectors: get_public_key via toncenter v2 runGetMethod)', () => {
  it('W5 mainnet 0:0c8c0fb5…', () => {
    expect(v5Address(pk('02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3'), 2147483409, -239, 0).toRawString())
      .toBe('0:0c8c0fb575238aaa844a89b36eb7546359e4e40297bcbe574c05611d884f36f1')
  })

  it('W5 testnet 0:e5958798…', () => {
    expect(v5Address(pk('922230e429c4eb6449d87ee90bc6d016766242a7536fbed8992fd4a8ffa1eceb'), 2147483645, -3, 0).toRawString())
      .toBe('0:e59587981adc7bc423d0fb46cd1f0a56bb53532957dd9e8ba5028d592d2c315d')
  })

  it('v4R2 with the default subwallet 698983191', () => {
    expect(defaultSubwalletId(0)).toBe(698983191)
    expect(defaultSubwalletId(-1)).toBe(698983190)
    expect(v4Address(pk('dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8'), 698983191, 0).toRawString())
      .toBe('0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699')
  })
})
