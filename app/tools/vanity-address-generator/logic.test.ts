import { Address } from '@ton/core'
import { keyPairFromSeed, mnemonicToPrivateKey, mnemonicValidate, mnemonicWordList } from '@ton/crypto'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import {
  bytes2hex, expectedTries, friendlyAddress, hex2bytes, isBasicTonMnemonic, matches, matchProbability, normalizePrefix,
  patternError, publicKeyFromSeed, searchKeys, searchMnemonics, tonMnemonicSeed, WALLET_CODE, walletHash
} from './logic'

const raw = async (v: 'v4r2' | 'v5r1', pub: string, testnet = false) => `0:${bytes2hex(await walletHash(v, hex2bytes(pub), testnet))}`

describe('wallet code constants', () => {
  it('match the code cells shipped in @ton/ton', () => {
    const k = Buffer.alloc(32)
    for (const [v, w] of [['v4r2', WalletContractV4.create({ workchain: 0, publicKey: k })], ['v5r1', WalletContractV5R1.create({ workchain: 0, publicKey: k })]] as const) {
      expect(w.init.code.hash().toString('hex')).toBe(WALLET_CODE[v].hash)
      expect(w.init.code.depth()).toBe(WALLET_CODE[v].depth)
    }
  })
})

// On-chain vectors: active wallets, public key from get_public_key (toncenter v2 runGetMethod), 2026-10-22.
describe('walletHash (direct StateInit hashing)', () => {
  it('v4R2 mainnet 0:3cd24f73…', async () => {
    expect(await raw('v4r2', 'dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8')).toBe('0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699')
  })
  it('W5 mainnet 0:0c8c0fb5…', async () => {
    expect(await raw('v5r1', '02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3')).toBe('0:0c8c0fb575238aaa844a89b36eb7546359e4e40297bcbe574c05611d884f36f1')
  })
  it('W5 testnet 0:e5958798…', async () => {
    expect(await raw('v5r1', '922230e429c4eb6449d87ee90bc6d016766242a7536fbed8992fd4a8ffa1eceb', true)).toBe('0:e59587981adc7bc423d0fb46cd1f0a56bb53532957dd9e8ba5028d592d2c315d')
  })
  it('agrees with @ton/ton for random keys', async () => {
    for (let i = 0; i < 20; i++) {
      const pub = Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
      expect(await raw('v4r2', pub.toString('hex'))).toBe(WalletContractV4.create({ workchain: 0, publicKey: pub }).address.toRawString())
      for (const testnet of [false, true]) {
        const w5 = WalletContractV5R1.create({ workchain: 0, publicKey: pub, walletId: { networkGlobalId: testnet ? -3 : -239 } })
        expect(await raw('v5r1', pub.toString('hex'), testnet)).toBe(w5.address.toRawString())
      }
    }
  })
})

describe('friendlyAddress', () => {
  it('matches @ton/core for every flag combination', () => {
    const a = Address.parse('0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699')
    for (const bounceable of [true, false]) {
      for (const testOnly of [true, false]) {
        expect(friendlyAddress(new Uint8Array(a.hash), bounceable, testOnly)).toBe(a.toString({ bounceable, testOnly, urlSafe: true }))
      }
    }
  })
})

describe('keys (Trust Wallet Core swift/Tests/Blockchains/TheOpenNetworkTests.swift)', () => {
  it('private key 63474e5f… -> public key f42c77f9… -> v4R2 UQBm--PF…', async () => {
    const pub = await publicKeyFromSeed(hex2bytes('63474e5fe9511f1526a50567ce142befc343e71a49b865ac3908f58667319cb8'))
    expect(bytes2hex(pub)).toBe('f42c77f931bea20ec5d0150731276bbb2e2860947661245b2319ef8133ee8d41')
    expect(friendlyAddress(await walletHash('v4r2', pub, false), false, false)).toBe('UQBm--PFwDv1yCeS-QTJ-L8oiUpqo9IT1BwgVptlSq3ts4DV')
  })

  it('TON mnemonic "document shield …" -> private key 112d4e2e… (WebCrypto PBKDF2 path)', async () => {
    const words = 'document shield addict crime broom point story depend suit satisfy test chicken valid tail speak fortune sound drill seek cube cheap body music recipe'.split(' ')
    expect(await isBasicTonMnemonic(words)).toBe(true)
    expect(bytes2hex(await tonMnemonicSeed(words))).toBe('112d4e2e700a468f1eae699329202f1ee671d6b665caa2d92dea038cf3868c18')
  })

  it('basic-seed check agrees with @ton/crypto mnemonicValidate', async () => {
    expect(await isBasicTonMnemonic('hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution'.split(' '))).toBe(true)
    expect(await isBasicTonMnemonic(Array(24).fill('abandon'))).toBe(false)
  })
})

describe('patterns', () => {
  it('validates characters and the fixed third character', () => {
    expect(patternError('', '')).toMatch(/prefix/)
    expect(patternError('Dur', '')).toBeNull()
    expect(patternError('Xyz', '')).toMatch(/A, B, C or D/)
    expect(patternError('dur', '')).toBeNull()
    expect(patternError('dur', '', true)).toMatch(/A, B, C or D/)
    expect(patternError('', 'ton!')).toMatch(/"!"/)
    expect(patternError('', 'GRAM')).toBeNull()
    expect(normalizePrefix('UQDurov')).toBe('Durov')
    expect(normalizePrefix('Durov')).toBe('Durov')
  })

  it('matches after the flag characters, optionally ignoring case', () => {
    const a = 'UQDYW_1eScJVxtitoBRksvoV9cCYo4uKGWLVNIHB1JqRRyQx'
    expect(matches(a, 'DYW', '', true)).toBe(true)
    expect(matches(a, 'dyw', 'ryqx', false)).toBe(true)
    expect(matches(a, 'dyw', '', true)).toBe(false)
    expect(matches(a, 'UQ', '', true)).toBe(false)
  })

  it('estimates difficulty', () => {
    expect(matchProbability('A', '', true)).toBe(1 / 4)
    expect(matchProbability('Ab', 'x1', true)).toBe(1 / 4 / 64 ** 3)
    expect(matchProbability('', 'ab1', false)).toBe((2 / 64) ** 2 / 64)
    expect(expectedTries('', 'ab', true, 1)).toBeCloseTo(4096)
    expect(expectedTries('', 'ab', true, 2)).toBeCloseTo(2048, -1)
  })
})

describe('search', () => {
  const opts = { versions: ['v5r1', 'v4r2'] as ('v5r1' | 'v4r2')[], testnet: false, bounceable: false, caseSensitive: true }

  it('key mode finds keys whose @ton/ton address really matches', async () => {
    const r = await searchKeys({ ...opts, mode: 'key', prefix: 'D', suffix: 'A' }, 5000)
    expect(r.found.length).toBeGreaterThan(0)
    for (const m of r.found) {
      const kp = keyPairFromSeed(Buffer.from(m.privateKey, 'hex'))
      expect(kp.publicKey.toString('hex')).toBe(m.publicKey)
      const w = m.version === 'v4r2' ? WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey }) : WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey })
      const addr = w.address.toString({ bounceable: false, urlSafe: true })
      expect(addr).toBe(m.address)
      expect(addr[2]).toBe('D')
      expect(addr.endsWith('A')).toBe(true)
    }
  })

  it('mnemonic mode returns a valid TON phrase that controls the address', async () => {
    const r = await searchMnemonics({ ...opts, mode: 'mnemonic', prefix: 'B', suffix: '', wordlist: mnemonicWordList }, 15000, 4)
    expect(r.found.length).toBeGreaterThan(0)
    const m = r.found[0]!
    expect(await mnemonicValidate(m.mnemonic!)).toBe(true)
    const kp = await mnemonicToPrivateKey(m.mnemonic!)
    expect(kp.publicKey.toString('hex')).toBe(m.publicKey)
    expect(kp.secretKey.subarray(0, 32).toString('hex')).toBe(m.privateKey)
    const w = m.version === 'v4r2' ? WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey }) : WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey })
    expect(w.address.toString({ bounceable: false, urlSafe: true })).toBe(m.address)
  }, 30000)
})
