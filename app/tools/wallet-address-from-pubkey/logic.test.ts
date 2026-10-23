import { describe, expect, it } from 'vitest'
import { addressesFromPublicKey, parsePublicKey } from './logic'

const find = (rows: ReturnType<typeof addressesFromPublicKey>, v: string) => rows.find(r => r.version === v)!

// On-chain vectors: active wallets; public key read with get_public_key (toncenter v2 runGetMethod),
// type and wallet_id from toncenter v3 walletStates (2026-10-22).
describe('addressesFromPublicKey', () => {
  it('v3R2 mainnet', () => {
    const rows = addressesFromPublicKey('b2da54384444026aaba8cc759e87db47aa3c6e6f3ef0fd53afb6c6b7db0f2403', { network: 'mainnet' })
    expect(find(rows, 'v3r2').raw).toBe('0:1d74761b534e68bcf87240f11067107e1668aebb7813d5daa549506b997a2dcb')
    expect(find(rows, 'v3r2').walletId).toBe(698983191)
  })

  it('v4R2 mainnet', () => {
    const rows = addressesFromPublicKey('0xdc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8', { network: 'mainnet' })
    expect(find(rows, 'v4r2').raw).toBe('0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699')
  })

  it('W5 mainnet and testnet are different accounts', () => {
    const main = addressesFromPublicKey('02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3', { network: 'mainnet' })
    expect(find(main, 'v5r1').raw).toBe('0:0c8c0fb575238aaa844a89b36eb7546359e4e40297bcbe574c05611d884f36f1')
    expect(find(main, 'v5r1').walletId! >>> 0).toBe(2147483409)
    const test = addressesFromPublicKey('922230e429c4eb6449d87ee90bc6d016766242a7536fbed8992fd4a8ffa1eceb', { network: 'testnet' })
    expect(find(test, 'v5r1').raw).toBe('0:e59587981adc7bc423d0fb46cd1f0a56bb53532957dd9e8ba5028d592d2c315d')
    expect(find(test, 'v5r1').nonBounceable).toMatch(/^0Q/)
  })

  it('Trust Wallet Core vector (swift/Tests/Blockchains/TheOpenNetworkTests.swift): v4R2', () => {
    const rows = addressesFromPublicKey('f42c77f931bea20ec5d0150731276bbb2e2860947661245b2319ef8133ee8d41', { network: 'mainnet' })
    expect(find(rows, 'v4r2').nonBounceable).toBe('UQBm--PFwDv1yCeS-QTJ-L8oiUpqo9IT1BwgVptlSq3ts4DV')
    expect(find(rows, 'v4r2').bounceable).toBe('EQBm--PFwDv1yCeS-QTJ-L8oiUpqo9IT1BwgVptlSq3ts90Q')
  })

  it('custom subwallet ids change v3/v4/W5 but not v1/v2', () => {
    const key = 'dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8'
    const a = addressesFromPublicKey(key, { network: 'mainnet' })
    const b = addressesFromPublicKey(key, { network: 'mainnet', subwalletId: 1, v5Subwallet: 1 })
    for (const v of ['v5r1', 'v4r2', 'v3r2', 'v3r1']) expect(find(b, v).raw).not.toBe(find(a, v).raw)
    for (const v of ['v2r2', 'v1r3']) expect(find(b, v).raw).toBe(find(a, v).raw)
    expect(find(b, 'v4r2').walletId).toBe(1)
  })

  it('masterchain addresses start with -1:', () => {
    const rows = addressesFromPublicKey('dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8', { network: 'mainnet', workchain: -1 })
    expect(rows.every(r => r.raw.startsWith('-1:'))).toBe(true)
    expect(find(rows, 'v4r2').walletId).toBe(698983190)
    // W5 on the masterchain carries workchain -1 in its wallet_id (@ton/ton WalletV5R1WalletId docs: 8388369).
    expect(find(rows, 'v5r1').walletId! >>> 0).toBe(8388369)
  })
})

describe('parsePublicKey', () => {
  it('accepts hex and base64 of the same key', () => {
    const hex = 'f42c77f931bea20ec5d0150731276bbb2e2860947661245b2319ef8133ee8d41'
    const b64 = Buffer.from(hex, 'hex').toString('base64')
    expect(parsePublicKey(b64).toString('hex')).toBe(hex)
    expect(parsePublicKey(b64.replace(/\+/g, '-').replace(/\//g, '_')).toString('hex')).toBe(hex)
  })

  it('rejects anything that is not 32 bytes', () => {
    expect(() => parsePublicKey('abcd')).toThrow(/32 bytes/)
    expect(() => parsePublicKey('UQBm--PFwDv1yCeS-QTJ-L8oiUpqo9IT1BwgVptlSq3ts4DV')).toThrow()
  })
})
