import { describe, expect, it } from 'vitest'
import trezor from '~/lib/wallet-derivation/bip39-vectors.test-data.json'
import { bip39Seed, parsePhrase, slip10Key } from '~/lib/wallet-derivation/phrase'
import { deriveWallets } from '~/lib/wallet-derivation/wallets'
import { deriveBip39, formatPath, ledgerPath, parsePath, TRUST_WALLET_PATH } from './logic'

describe('BIP39 seed (Trezor python-mnemonic vectors.json, passphrase "TREZOR")', () => {
  it('matches all 24 English vectors', async () => {
    for (const v of trezor.vectors) {
      expect((await bip39Seed(parsePhrase(v.mnemonic), 'TREZOR')).toString('hex'), v.mnemonic).toBe(v.seed)
    }
  })
})

describe('SLIP-10 ed25519 (satoshilabs/slips slip-0010.md, test vector 1)', () => {
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')
  it.each([
    ['m/0\'', '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3', '8c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c'],
    ['m/0\'/1\'/2\'/2\'/1000000000\'', '8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793', '3c24da049451555d51a7014a37337aa4e12d41e485abccfa46b47dfb2af54b7a']
  ])('%s', async (path, priv, pub) => {
    expect(await slip10Key(seed, parsePath(path))).toEqual({ privateKey: priv, publicKey: pub })
  })
})

describe('deriveBip39', () => {
  it('Trust Wallet Core vector (tests/chains/TheOpenNetwork/TWAnyAddressTests.cpp), an active v4R2 wallet on mainnet', async () => {
    const r = await deriveBip39('stuff diamond cycle federal scan spread pigeon people engage teach snack grain', '', [{ label: 'Trust', path: TRUST_WALLET_PATH }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v4 = deriveWallets(r.keys[0]!.publicKey, { network: 'mainnet', versions: ['v4r2'] })[0]!
    // toncenter v3 walletStates: 0:D85BFD5E…9147, "wallet v4 r2", seqno 17 (2026-10-22).
    expect(v4.nonBounceable).toBe('UQDYW_1eScJVxtitoBRksvoV9cCYo4uKGWLVNIHB1JqRRyQx')
  })

  it('passphrase changes the keys', async () => {
    const text = 'stuff diamond cycle federal scan spread pigeon people engage teach snack grain'
    const [a, b] = await Promise.all([deriveBip39(text, '', [{ label: 'x', path: TRUST_WALLET_PATH }]), deriveBip39(text, 'extra', [{ label: 'x', path: TRUST_WALLET_PATH }])])
    expect(a.ok && b.ok && a.keys[0]!.publicKey !== b.keys[0]!.publicKey).toBe(true)
  })

  it('explains failures', async () => {
    expect(await deriveBip39('', '', [])).toEqual({ ok: false, problem: 'empty' })
    expect(await deriveBip39('stuff diamnd', '', [])).toEqual({ ok: false, problem: 'unknown-words', unknown: ['diamnd'] })
    expect(await deriveBip39('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', '', [])).toEqual({ ok: false, problem: 'checksum' })
    expect(await deriveBip39('abandon abandon abandon', '', [])).toEqual({ ok: false, problem: 'length' })
    // @ton/crypto mnemonic.spec.js vector: a TON phrase, not BIP39.
    expect(await deriveBip39('hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution', '', []))
      .toEqual({ ok: false, problem: 'ton' })
  })
})

describe('paths', () => {
  it('Ledger path per ton-ledger-ts pathForAccount and LedgerHQ/app-ton tests', () => {
    expect(formatPath(ledgerPath(0))).toBe('m/44\'/607\'/0\'/0\'/0\'/0\'')
    expect(formatPath(ledgerPath(1))).toBe('m/44\'/607\'/0\'/0\'/1\'/0\'')
    expect(ledgerPath(0, 'testnet')).toEqual([44, 607, 1, 0, 0, 0])
  })

  it('parses hardened paths and rejects others', () => {
    expect(parsePath('m/44\'/607\'/0\'')).toEqual([44, 607, 0])
    expect(parsePath(' M / 44h / 607H / 0\' ')).toEqual([44, 607, 0])
    expect(() => parsePath('m/44\'/607\'/0')).toThrow(/hardened/)
    expect(() => parsePath('44\'/607\'')).toThrow(/m\//)
    expect(() => parsePath('m/2147483648\'')).toThrow(/too large/)
  })
})
