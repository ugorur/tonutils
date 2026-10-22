import { mnemonicValidate, mnemonicWordList } from '@ton/crypto'
import { describe, expect, it } from 'vitest'
import { deriveFromMnemonic, generateMnemonic, walletsForPublicKey } from './logic'

const pk = (hex: string) => Buffer.from(hex, 'hex')

// On-chain vectors: real active wallets, public key read with the contract's get_public_key
// get-method via toncenter, wallet type and wallet_id from toncenter v3 walletStates.
describe('walletsForPublicKey (on-chain vectors)', () => {
  const find = (key: string, v: string) => walletsForPublicKey(pk(key)).find(w => w.version === v)!

  it('v3R2 (mainnet, wallet_id 698983191)', () => {
    expect(find('b2da54384444026aaba8cc759e87db47aa3c6e6f3ef0fd53afb6c6b7db0f2403', 'v3r2').mainnet.raw)
      .toBe('0:1d74761b534e68bcf87240f11067107e1668aebb7813d5daa549506b997a2dcb')
  })

  it('v4R2 (mainnet, wallet_id 698983191)', () => {
    expect(find('dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8', 'v4r2').mainnet.raw)
      .toBe('0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699')
  })

  it('W5 v5R1 (mainnet, wallet_id 2147483409)', () => {
    expect(find('02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3', 'v5r1').mainnet.raw)
      .toBe('0:0c8c0fb575238aaa844a89b36eb7546359e4e40297bcbe574c05611d884f36f1')
  })

  it('W5 v5R1 (testnet, wallet_id 2147483645) is a different account than mainnet', () => {
    const w = find('922230e429c4eb6449d87ee90bc6d016766242a7536fbed8992fd4a8ffa1eceb', 'v5r1')
    expect(w.testnet.raw).toBe('0:e59587981adc7bc423d0fb46cd1f0a56bb53532957dd9e8ba5028d592d2c315d')
    expect(w.mainnet.raw).not.toBe(w.testnet.raw)
    expect(w.testnet.nonBounceable).toMatch(/^0Q/)
  })

  it('uses the same account for v3/v4 on both networks, only the flag differs', () => {
    const [, v4, v3] = walletsForPublicKey(pk('dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8'))
    for (const w of [v4!, v3!]) {
      expect(w.testnet.raw).toBe(w.mainnet.raw)
      expect(w.mainnet.nonBounceable).toMatch(/^UQ/)
      expect(w.mainnet.bounceable).toMatch(/^EQ/)
      expect(w.testnet.nonBounceable).toMatch(/^0Q/)
    }
  })
})

describe('deriveFromMnemonic', () => {
  it('matches the @ton/crypto mnemonic test vector', async () => {
    // node_modules/@ton/crypto/dist/mnemonic/mnemonic.spec.js
    const words = 'hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution'.split(' ')
    const secret = '9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97df6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd'
    const r = await deriveFromMnemonic(words)
    expect(r.secretKey).toBe(secret)
    expect(r.privateKey).toBe(secret.slice(0, 64))
    expect(r.publicKey).toBe(secret.slice(64))
    expect(r.wallets.map(w => w.version)).toEqual(['v5r1', 'v4r2', 'v3r2'])
  })

  it('rejects an invalid phrase', async () => {
    await expect(deriveFromMnemonic(Array(24).fill('abandon'))).rejects.toThrow(/valid/)
  })
})

describe('generateMnemonic', () => {
  it('generates a valid, unique 24-word phrase from the TON wordlist', async () => {
    const [a, b] = await Promise.all([generateMnemonic(), generateMnemonic()])
    expect(a).toHaveLength(24)
    expect(a.every(w => mnemonicWordList.includes(w))).toBe(true)
    expect(await mnemonicValidate(a)).toBe(true)
    expect(a).not.toEqual(b)
  }, 20_000)
})
