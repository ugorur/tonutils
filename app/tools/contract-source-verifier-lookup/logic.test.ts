import { describe, expect, it } from 'vitest'
import { cellFromApi, parseAddressOrHash, summarizeCode } from '~/lib/contracts-read/cells'
import { USDT_WALLET_CODE, USDT_WALLET_LIB_HASH } from '~/lib/contracts-read/fixtures'
import { USDT_MASTER_VERIFIER } from './fixture'
import { proxyUrl, toSourceView, verifierPageUrl, type VerifierResponse } from './logic'

describe('toSourceView', () => {
  it('orders the real USDT master bundle: entrypoint, own files, stdlib', () => {
    const v = toSourceView(USDT_MASTER_VERIFIER as VerifierResponse)
    expect(v.verified).toBe(true)
    expect(v.language).toBe('FunC')
    expect(v.version).toBe('0.4.4-newops.1')
    expect(v.entrypoint).toBe('jetton-minter.fc')
    expect(v.verifiedAt?.toISOString()).toBe('2024-04-02T15:00:00.000Z')
    expect(v.files.map(f => f.path)).toEqual(['jetton-minter.fc', 'gas.fc', 'jetton-utils.fc', 'op-codes.fc', 'workchain.fc', 'stdlib.fc'])
  })

  // Real verifier.ton.org 404 bodies (2026-10-22): wallet v3r2 code hash, and a random hash.
  it('explains blocked and unverified hashes', () => {
    const blocked = toSourceView({ code_hash: '84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599', verified: false, error: 'code_hash_blocked: access to code_hash 84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599 is disabled' })
    expect(blocked.reason).toMatch(/standard wallet/)
    const missing = toSourceView({ code_hash: '00'.repeat(32), verified: false, error: 'verified source was not found for code_hash 00' })
    expect(missing.reason).toMatch(/No verified source/)
  })
})

describe('lookup target', () => {
  it('uses the library hash for library-based code (verifier.ton.org verifies jetton-wallet.fc under it)', () => {
    expect(summarizeCode(cellFromApi(USDT_WALLET_CODE)).effectiveHash).toBe(USDT_WALLET_LIB_HASH)
  })

  it('accepts a base64 code hash (toncenter v3 accountStates code_hash) and converts it to hex', () => {
    expect(parseAddressOrHash('GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=')).toEqual({ kind: 'hash', hex: USDT_MASTER_VERIFIER.code_hash })
  })

  it('builds URLs', () => {
    expect(proxyUrl('ab')).toBe('/api/tools/contract-source-verifier-lookup/source?code_hash=ab')
    expect(verifierPageUrl('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')).toBe('https://verifier.ton.org/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
  })
})
