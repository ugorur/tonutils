import { describe, expect, it } from 'vitest'
import trezor from '~/lib/wallet-derivation/bip39-vectors.test-data.json'
import { checkPhrase } from './logic'

describe('checkPhrase', () => {
  it('accepts every Trezor BIP39 English vector as BIP39', async () => {
    for (const v of trezor.vectors) {
      const r = await checkPhrase(v.mnemonic)
      expect(r.bip39, v.mnemonic).toBe(true)
      expect(['bip39', 'both']).toContain(r.verdict)
    }
  })

  it('rejects a BIP39 phrase with a wrong last word (checksum)', async () => {
    const r = await checkPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon')
    expect(r.bip39).toBe(false)
    expect(r.verdict).toBe('neither')
  })

  it('recognises TON mnemonics (@ton/crypto test vectors)', async () => {
    const r = await checkPhrase('hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution')
    expect(r.ton).toBe('ton')
    expect(r.verdict).toBe('ton')
    expect(r.count).toBe(24)
  })

  it('detects a password-protected TON phrase (made with @ton/crypto mnemonicNew(24, "qwerty"))', async () => {
    const r = await checkPhrase('pink tilt law help rug crater young custom diary ginger night glance gloom zero tunnel alien canoe auto bar buddy alcohol keen water fly')
    expect(r.verdict).toBe('ton-password')
  })

  it('reports a phrase valid under both schemes', async () => {
    // Found with an independent Python implementation (hashlib BIP39 checksum + tonlib is_basic_seed).
    const r = await checkPhrase('blame weasel save pig erosion gaze fluid chimney clerk arrange giggle box')
    expect(r).toMatchObject({ ton: 'ton', bip39: true, verdict: 'both' })
  })

  it('flags unknown words with suggestions and tolerates numbering', async () => {
    const r = await checkPhrase('1. abandn 2) zoo, 3 hospitl')
    expect(r.verdict).toBe('unknown-words')
    expect(r.words.map(w => w.word)).toEqual(['abandn', 'zoo', 'hospitl'])
    expect(r.words[0]!.suggestions[0]).toBe('abandon')
    expect(r.words[2]!.suggestions).toContain('hospital')
    expect(r.words[1]!.known).toBe(true)
  })

  it('handles empty input', async () => {
    expect((await checkPhrase('')).verdict).toBe('empty')
  })
})
