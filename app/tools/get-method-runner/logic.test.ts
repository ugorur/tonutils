import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { USDT_WALLET_LIB_HASH } from '~/lib/contracts-read/fixtures'
import { decodeEntry, exitInfo, isMethodName, parseNum, toStackEntry, type Decoded, type StackEntry } from './logic'

// All stacks below are real toncenter POST /api/v3/runGetMethod answers (mainnet, 2026-10-22).
const USDT_MASTER_GET_JETTON_DATA: StackEntry[] = [
  { type: 'num', value: '0x5148e3baabcb0' },
  { type: 'num', value: '-0x1' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4AMiB/HjSggcHLHKKLniWIo834XNprhIcsO73tLA4XzMxC89RGs' },
  { type: 'cell', value: 'te6cckEBBwEAfQABAwDAAQIBIAIDAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZABAFDv/dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQAYBAgAFAD5odHRwczovL3RldGhlci50by91c2R0LXRvbi5qc29uAAQANhfFQ3M=' },
  { type: 'cell', value: 'te6cckEBAQEAIwAIQgKPRS16Tf10BmtoI2UXclntBXNENb52tf1L1divK3w9aCBrv3Y=' }
]
// get_wallet_data of USDT wallet 0:2626CF30… (owner 0:23FA97…, balance per toncenter /api/v3/jetton/wallets: 939188090649145)
const USDT_WALLET_GET_WALLET_DATA: StackEntry[] = [
  { type: 'num', value: '0x3562fc4853a39' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4AEf1LzIx4/zgW3IgF/CH0PjgK9mac0jkPTbXWC4XgJnHCuZTBA' }
]
// get_collection_data of Anonymous Telegram Numbers (toncenter nft/collections: uri numbers.json, owner null)
const NUMBERS_GET_COLLECTION_DATA: StackEntry[] = [
  { type: 'num', value: '-0x1' },
  { type: 'cell', value: 'te6cckEBAQEAKAAATAFodHRwczovL25mdC5mcmFnbWVudC5jb20vbnVtYmVycy5qc29uK1hS4w==' },
  { type: 'cell', value: 'te6cckEBAQEAAwAAASCUQYZV' }
]

const cellOf = (d: Decoded) => {
  if (d.kind !== 'cell') throw new Error(`expected cell, got ${d.kind}`)
  return d
}

describe('decodeEntry', () => {
  it('decodes numbers (wallet v4 seqno 0x157 = 343, tonapi decoded state 343)', () => {
    expect(decodeEntry({ type: 'num', value: '0x157' })).toMatchObject({ kind: 'num', dec: '343', hex: '0x157' })
  })

  it('decodes get_jetton_data of the USDT master', () => {
    const [supply, mintable, admin, content, code] = USDT_MASTER_GET_JETTON_DATA.map(decodeEntry)
    expect(supply).toMatchObject({ kind: 'num', value: 0x5148e3baabcb0n })
    expect(mintable).toMatchObject({ kind: 'num', dec: '-1', bool: true })
    expect(cellOf(admin!).address!.toRawString()).toBe('0:6440fe3c69410383963945173c4b11479bf0b9b4d7090e58777bda581c2f9998') // toncenter jetton/masters admin_address
    expect(cellOf(content!).address).toBeUndefined()
    expect(cellOf(content!).onchainMeta).toBe(true) // 0x00 prefix: on-chain metadata dictionary
    expect(cellOf(code!).library).toBe(USDT_WALLET_LIB_HASH)
  })

  it('decodes get_wallet_data balance and owner of a USDT wallet', () => {
    const [balance, owner] = USDT_WALLET_GET_WALLET_DATA.map(decodeEntry)
    expect(balance).toMatchObject({ kind: 'num', dec: '939188090649145' })
    expect(cellOf(owner!).address!.toRawString()).toBe('0:23fa979918f1fe702db9100bf843e87c7015eccd39a4721e9b6bac170bc04ce3')
  })

  it('decodes an off-chain content URI and addr_none', () => {
    const [, content, owner] = NUMBERS_GET_COLLECTION_DATA.map(decodeEntry)
    expect(cellOf(content!).uri).toBe('https://nft.fragment.com/numbers.json')
    expect(cellOf(owner!).address).toBeNull()
  })

  it('decodes lists (wallet v4 get_plugin_list) and unknown types', () => {
    expect(decodeEntry({ type: 'list', value: [] })).toEqual({ kind: 'tuple', type: 'list', items: [] })
    expect(decodeEntry({ type: 'tuple', value: [{ type: 'num', value: '0x1' }] })).toMatchObject({ kind: 'tuple', items: [{ kind: 'num', dec: '1' }] })
    expect(decodeEntry({ type: 'weird', value: 1 })).toEqual({ kind: 'unknown', type: 'weird', raw: 1 })
  })
})

describe('toStackEntry', () => {
  it('encodes an address argument exactly as toncenter serialises that address', () => {
    // toncenter returned this owner slice in get_wallet_data; passing it to the USDT master's get_wallet_address
    // returned the wallet 0:2626CF30… (matches toncenter /api/v3/jetton/wallets).
    const e = toStackEntry({ type: 'address', value: 'EQAj-peZGPH-cC25EAv4Q-h8cBXszTmkch6ba6wXC8BM4xdo' }, 0)
    expect(e.type).toBe('slice')
    expect(Cell.fromBase64(e.value as string).equals(Cell.fromBase64(USDT_WALLET_GET_WALLET_DATA[1]!.value as string))).toBe(true)
  })

  it('encodes numbers as toncenter hex', () => {
    expect(toStackEntry({ type: 'num', value: '343' }, 0)).toEqual({ type: 'num', value: '0x157' })
    expect(toStackEntry({ type: 'num', value: '-0x1' }, 0)).toEqual({ type: 'num', value: '-0x1' })
    expect(toStackEntry({ type: 'num', value: '1_000' }, 0)).toEqual({ type: 'num', value: '0x3e8' })
  })

  it('validates', () => {
    expect(() => toStackEntry({ type: 'num', value: '1.5' }, 1)).toThrow(/Argument 2: "1.5" is not an integer/)
    expect(() => toStackEntry({ type: 'address', value: 'nope' }, 0)).toThrow(/Argument 1/)
    expect(() => toStackEntry({ type: 'cell', value: 'zz' }, 0)).toThrow(/BOC/)
    expect(parseNum('0xFF')).toBe(255n)
  })
})

describe('misc', () => {
  it('explains exit codes (11 = toncenter answer for a missing method, -13 = account without code)', () => {
    expect(exitInfo(0).ok).toBe(true)
    expect(exitInfo(11)).toMatchObject({ ok: false, text: expect.stringMatching(/Method not found/) })
    expect(exitInfo(-13).text).toMatch(/no code/)
    expect(exitInfo(2).text).toMatch(/more arguments/)
    expect(exitInfo(777).text).toMatch(/custom/)
  })

  it('accepts method names', () => {
    expect(isMethodName('get_jetton_data')).toBe(true)
    expect(isMethodName('seqno')).toBe(true)
    expect(isMethodName('drop table')).toBe(false)
  })
})
