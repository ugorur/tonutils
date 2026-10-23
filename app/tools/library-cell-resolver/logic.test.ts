import { beginCell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { cellFromApi, findLibraryCells, normalizeHash, statsText } from '~/lib/contracts-read/cells'
import { USDT_WALLET_CODE, USDT_WALLET_CODE_HASH_B64, USDT_WALLET_LIB_BOC, USDT_WALLET_LIB_HASH } from '~/lib/contracts-read/fixtures'
import { libraryQuery, parseResolverInput, pickLibrary } from './logic'

// Vectors: USDT jetton wallet code (toncenter /api/v3/account), its indexed code_hash (toncenter jetton/wallets),
// and the library body returned by toncenter /api/v2/getLibraries (same bytes as tonapi /v2/blockchain/libraries/{hash}).
describe('library cells', () => {
  it('finds the library hash in the USDT jetton wallet code', () => {
    const code = cellFromApi(USDT_WALLET_CODE)
    const libs = findLibraryCells(code)
    expect(libs).toEqual([{ cellHash: normalizeHash(USDT_WALLET_CODE_HASH_B64), libraryHash: USDT_WALLET_LIB_HASH, path: 'root' }])
  })

  it('finds library cells nested under ordinary cells', () => {
    const lib = cellFromApi(USDT_WALLET_CODE)
    const wrapper = beginCell().storeUint(7, 8).storeRef(beginCell().storeRef(lib)).endCell()
    expect(findLibraryCells(wrapper).map(l => [l.path, l.libraryHash])).toEqual([['root.0.0', USDT_WALLET_LIB_HASH]])
  })

  it('reports nothing for ordinary code', () => {
    expect(findLibraryCells(cellFromApi(USDT_WALLET_LIB_BOC))).toEqual([])
  })
})

describe('pickLibrary', () => {
  const res = { result: [{ hash: 'j0Utek39dAZraCNlF3JZ7QVzRDW+drX9S9XYryt8PWg=', data: USDT_WALLET_LIB_BOC }] }

  it('builds the getLibraries query (toncenter returns the same base64 hash back)', () => {
    expect(libraryQuery(USDT_WALLET_LIB_HASH)).toBe(res.result[0]!.hash)
  })

  it('returns the verified code', () => {
    const r = pickLibrary(res, USDT_WALLET_LIB_HASH)!
    expect(r.summary.hashHex).toBe(USDT_WALLET_LIB_HASH)
    expect(r.summary.stats.cells).toBe(15) // BOC header b5ee9c72 01 02 0f: 15 cells
    expect(r.summary.libraries).toEqual([])
    expect(statsText({ cells: 1, bits: 264, depth: 0 })).toBe('1 cell, 264 bits, depth 0')
    expect(statsText(r.summary.stats)).toMatch(/^15 cells, /)
    expect(r.boc).toBe(USDT_WALLET_LIB_BOC) // exact API bytes, not re-serialised
  })

  it('returns null when the library is not on chain', () => {
    expect(pickLibrary({ result: [] }, USDT_WALLET_LIB_HASH)).toBeNull()
  })

  it('rejects code that does not hash to the requested library', () => {
    const other = 'ab'.repeat(32)
    expect(() => pickLibrary({ result: [{ hash: libraryQuery(other), data: USDT_WALLET_LIB_BOC }] }, other)).toThrow(/Not trusting/)
  })
})

describe('parseResolverInput', () => {
  it('accepts addresses, hashes and BOCs', () => {
    expect(parseResolverInput('0:2626CF30B702BDDED845EFC883EFA45029FF59DEFDACC4CE7B8B0A5966D75002').kind).toBe('address')
    expect(parseResolverInput(USDT_WALLET_LIB_HASH)).toEqual({ kind: 'hash', hex: USDT_WALLET_LIB_HASH })
    expect(parseResolverInput('j0Utek39dAZraCNlF3JZ7QVzRDW+drX9S9XYryt8PWg=')).toEqual({ kind: 'hash', hex: USDT_WALLET_LIB_HASH })
    expect(parseResolverInput(USDT_WALLET_CODE).kind).toBe('boc')
  })

  it('rejects garbage', () => {
    expect(() => parseResolverInput('hello')).toThrow(/Not an address/)
    expect(() => parseResolverInput('  ')).toThrow(/Enter/)
  })
})
