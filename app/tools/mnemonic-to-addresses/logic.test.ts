import { describe, expect, it } from 'vitest'
import { deriveWallets } from '~/lib/wallet-derivation/wallets'
import { keysFromPhrase } from './logic'

describe('keysFromPhrase', () => {
  it('@ton/crypto test vector (dist/mnemonic/mnemonic.spec.js)', async () => {
    const r = await keysFromPhrase('dose ice enrich trigger test dove century still betray gas diet dune use other base gym mad law immense village world example praise game')
    const secret = '119dcf2840a3d56521d260b2f125eedc0d4f3795b9e627269a4b5a6dca8257bdc04ad1885c127fe863abb00752fa844e6439bb04f264d70de7cea580b32637ab'
    expect(r).toEqual({ ok: true, words: 24, keys: { privateKey: secret.slice(0, 64), publicKey: secret.slice(64) } })
  })

  it('Trust Wallet Core vector (TheOpenNetworkTests.swift, derived with tonweb-mnemonic), numbered and mixed case input', async () => {
    const text = '1. Document 2. shield 3. addict 4. crime\n5. broom 6. point 7. story 8. depend 9. suit 10. satisfy 11. test 12. chicken 13. valid 14. tail 15. speak 16. fortune 17. sound 18. drill 19. seek 20. cube 21. cheap 22. body 23. music 24. recipe'
    const r = await keysFromPhrase(text)
    expect(r.ok && r.keys.privateKey).toBe('112d4e2e700a468f1eae699329202f1ee671d6b665caa2d92dea038cf3868c18')
  })

  it('key -> address matches the Trust Wallet Core v4R2 vector', () => {
    // swift/Tests/Blockchains/TheOpenNetworkTests.swift: public key f42c77f9… -> UQBm--PF…
    const v4 = deriveWallets('f42c77f931bea20ec5d0150731276bbb2e2860947661245b2319ef8133ee8d41', { network: 'mainnet', versions: ['v4r2'] })[0]!
    expect(v4.nonBounceable).toBe('UQBm--PFwDv1yCeS-QTJ-L8oiUpqo9IT1BwgVptlSq3ts4DV')
  })

  it('password-protected phrase (made with @ton/crypto mnemonicNew(24, "qwerty"))', async () => {
    const text = 'pink tilt law help rug crater young custom diary ginger night glance gloom zero tunnel alien canoe auto bar buddy alcohol keen water fly'
    expect(await keysFromPhrase(text)).toEqual({ ok: false, problem: { kind: 'needs-password' } })
    expect(await keysFromPhrase(text, 'nope')).toEqual({ ok: false, problem: { kind: 'wrong-password' } })
    const r = await keysFromPhrase(text, 'qwerty')
    // Cross-checked with node:crypto PBKDF2/HMAC + Ed25519 (tonlib scheme), independent of @ton/crypto.
    expect(r.ok && r.keys.publicKey).toBe('3ea6473fdc6756455b960f27b810ad8be96c75e920a7c109155f60c66ea31dc1')
  })

  it('tells a password is not needed for a plain TON phrase', async () => {
    const plain = 'dose ice enrich trigger test dove century still betray gas diet dune use other base gym mad law immense village world example praise game'
    expect(await keysFromPhrase(plain, 'qwerty')).toEqual({ ok: false, problem: { kind: 'no-password' } })
  })

  it('points BIP39 phrases (Trezor vectors) to the BIP39 tool', async () => {
    expect(await keysFromPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'))
      .toEqual({ ok: false, problem: { kind: 'bip39' } })
  })

  it('reports unknown words and empty input', async () => {
    expect(await keysFromPhrase('dose ice enrichh')).toEqual({ ok: false, problem: { kind: 'unknown-words', words: ['enrichh'] } })
    expect(await keysFromPhrase('  ')).toEqual({ ok: false, problem: { kind: 'empty' } })
    expect(await keysFromPhrase(Array(24).fill('abandon').join(' '))).toEqual({ ok: false, problem: { kind: 'invalid' } })
  })
})
