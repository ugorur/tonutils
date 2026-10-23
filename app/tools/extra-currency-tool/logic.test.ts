import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { extraCurrencyCollection, fromTonapi, fromToncenter, mergeEntries, normalizeCurrencyId, parseExtraCurrencyCollection, signedCurrencyId, tonConnectExtraCurrency, walletSupportsExtraCurrency } from './logic'

// Mainnet ConfigParam 7 (to_mint:ExtraCurrencyCollection), toncenter v2 getConfigParam?config_id=7, 2026-10-22.
// tonapi /v2/blockchain/config shows the same param as [{currency_id: 239, amount: 666666666666}, {currency_id: 4294967279, amount: 1000000000000}].
const CONFIG7 = 'te6cckEBBAEAIwABAcABAgEgAgMAFb4AAAO8s2cNwVVQABW/////vL0alKIAEMu9AAU='

describe('ExtraCurrencyCollection', () => {
  it('builds mainnet ConfigParam 7 bit for bit', () => {
    const cell = extraCurrencyCollection([{ id: 239, amount: 666666666666n }, { id: 4294967279, amount: 1000000000000n }])
    expect(cell.hash().toString('hex')).toBe(Cell.fromBase64(CONFIG7).hash().toString('hex'))
  })
  it('parses it back with uint32 ids', () => {
    const m = parseExtraCurrencyCollection(Cell.fromBase64(CONFIG7))
    expect([...m]).toEqual([[239, 666666666666n], [4294967279, 1000000000000n]])
  })
})

describe('currency ids', () => {
  // toncenter v2 getAddressInformation(-1:000…000) prints the 4294967279 currency of ConfigParam 7 as id -17.
  it('maps the signed API form to uint32 and back', () => {
    expect(normalizeCurrencyId(-17)).toBe(4294967279)
    expect(normalizeCurrencyId('239')).toBe(239)
    expect(signedCurrencyId(4294967279)).toBe(-17)
    expect(signedCurrencyId(239)).toBe(239)
    expect(() => normalizeCurrencyId(2 ** 32)).toThrow()
    expect(() => normalizeCurrencyId('1.5')).toThrow()
  })
  it('reads toncenter and tonapi balances of the mainnet system account', () => {
    // toncenter v2 getAddressInformation and tonapi /v2/accounts for -1:000…000, 2026-10-22.
    expect(fromToncenter([{ id: 239, amount: '663333333334' }, { id: -17, amount: '998444444446' }]).map(b => b.id)).toEqual([239, 4294967279])
    const t = fromTonapi([{ amount: '663333333334', preview: { id: 239, symbol: 'FMS', decimals: 5 } }, { amount: '998444444446', preview: { id: -17, symbol: '$-17', decimals: 9 } }])
    expect(t[0]).toEqual({ id: 239, amount: 663333333334n, symbol: 'FMS', decimals: 5 })
    expect(t[1]!.id).toBe(4294967279)
  })
})

describe('TonConnect payload', () => {
  it('merges duplicate ids and uses uint32 keys with string amounts', () => {
    expect(tonConnectExtraCurrency([{ id: 100, amount: 5n }, { id: 100, amount: 2n }, { id: -17, amount: 1n }])).toEqual({ 100: '7', 4294967279: '1' })
  })
  it('rejects zero and oversized amounts', () => {
    expect(() => mergeEntries([{ id: 1, amount: 0n }])).toThrow(/greater than zero/)
    expect(() => mergeEntries([{ id: 1, amount: 1n << 248n }])).toThrow(/too large/)
  })
  it('detects wallet support from the TonConnect SendTransaction feature', () => {
    expect(walletSupportsExtraCurrency(['SendTransaction', { name: 'SendTransaction', maxMessages: 4, extraCurrencySupported: true }])).toBe(true)
    expect(walletSupportsExtraCurrency([{ name: 'SendTransaction', maxMessages: 4 }])).toBe(false)
    expect(walletSupportsExtraCurrency(undefined)).toBe(false)
  })
})
