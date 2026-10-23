import { beginCell, storeStateInit } from '@ton/core'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import type { SignatureBundle } from './logic'
import { crc32, encodeDomainDns, parseBundle, publicKeyFromStateInit, signedHash, verifySignature } from './logic'

// Real wallet signatures from near/intents crates/signatures/ton-connect/src/lib.rs (verify_ok test cases),
// signed by a TonConnect wallet on ton-connect.github.io.
const PUBKEY = '22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37'
const ADDRESS = '0:f4809e5ffac9dc42a6b1d94c5e74ad5fd86378de675c805f2274d0055cbc9378'
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64')

const TEXT: SignatureBundle = {
  address: ADDRESS,
  domain: 'ton-connect.github.io',
  timestamp: 1747759882,
  payload: { type: 'text', text: 'Hello, TON!'.repeat(100) },
  signature: b64('7bc628f6d634ab6ddaf10463742b13f0ede3cb828737d9ce1962cc808fbfe7035e77c1a3d0b682acf02d645cc1a244992b276552c0e1c57d30b03c2820d73d01')
}
const BINARY: SignatureBundle = {
  address: ADDRESS,
  domain: 'ton-connect.github.io',
  timestamp: 1747760435,
  payload: { type: 'binary', bytes: b64('48656c6c6f2c20544f4e21') },
  signature: b64('9cf4c1c16b47afce46940eb9cd410894f31544b74206c2254bb1651f9b32cf5b0e482b78a2e8251e54d3517fae4b06c6f23546667d63ff62dccce70451698d01')
}
// The source gives only crc32(schema) = 0x2eccd0c1, not the schema text. Signed in May 2025 with the plain
// domain in the cell (before wallets switched to the TEP-81 wire form, see Tonkeeper's encodeDnsName).
const CELL: SignatureBundle = {
  address: ADDRESS,
  domain: 'ton-connect.github.io',
  timestamp: 1747772412,
  payload: { type: 'cell', schema: '(unknown)', cell: 'te6cckEBAQEAEQAAHgAAAABIZWxsbywgVE9OIb7WCx4=' },
  signature: b64('6ad083855374c201c2acb14aa4e7eef44603c8d356624c8fd3b6be3babd84bd8bc7390f0ed4484ab58a535b3088681e0006839eb07136470985b3a33bfa17c05')
}

describe('signData signatures (TonConnect spec)', () => {
  it('verifies real text, binary and cell signatures', () => {
    expect(verifySignature(TEXT, PUBKEY)).toBe(true)
    expect(verifySignature(BINARY, PUBKEY)).toBe(true)
    expect(verifySignature(CELL, PUBKEY, 0x2eccd0c1)).toBe(true)
  })
  it('rejects any change to the signed fields', () => {
    expect(verifySignature({ ...TEXT, timestamp: TEXT.timestamp + 1 }, PUBKEY)).toBe(false)
    expect(verifySignature({ ...TEXT, domain: 'evil.example' }, PUBKEY)).toBe(false)
    expect(verifySignature({ ...BINARY, payload: { type: 'text', text: 'Hello, TON!' } }, PUBKEY)).toBe(false)
    expect(verifySignature(CELL, PUBKEY, 0x2eccd0c2)).toBe(false)
    expect(verifySignature({ ...TEXT, signature: 'AAAA' }, PUBKEY)).toBe(false)
  })
  it('hashes differ by payload type', () => {
    expect(signedHash(TEXT).toString('hex')).not.toBe(signedHash({ ...TEXT, payload: { type: 'binary', bytes: Buffer.from(TEXT.payload.type === 'text' ? TEXT.payload.text : '').toString('base64') } }).toString('hex'))
  })
})

describe('helpers', () => {
  it('crc32 matches the CRC-32/ISO-HDLC check value and zlib', () => {
    expect(crc32('123456789')).toBe(0xcbf43926)
    // Schema used by the TonConnect demo dApp; zlib.crc32 gives 0x3fec5b79.
    expect(crc32('message#_ len:uint7 {len <= 127} text:(bits len * 8) = Message;')).toBe(0x3fec5b79)
  })
  it('encodes the domain in TEP-81 wire form', () => {
    expect(encodeDomainDns('stonfi.com')).toBe('com\0stonfi\0') // example from the TonConnect spec
    expect(encodeDomainDns('TON-Connect.github.io.')).toBe('io\0github\0ton-connect\0')
  })
  it('parses bundles and raw SignDataResponse JSON', () => {
    const b = parseBundle(JSON.stringify({ ...TEXT, public_key: PUBKEY.toUpperCase() }))
    expect(b.publicKey).toBe(PUBKEY)
    expect(verifySignature(b, b.publicKey!)).toBe(true)
    expect(parseBundle(JSON.stringify({ result: BINARY, id: '44' })).payload.type).toBe('binary')
    expect(() => parseBundle('{')).toThrow(/JSON/)
    expect(() => parseBundle('{"signature":"x"}')).toThrow(/Missing/)
  })
})

describe('publicKeyFromStateInit', () => {
  // StateInits built by @ton/ton's own wallet wrappers for the key above.
  const key = Buffer.from(PUBKEY, 'hex')
  for (const w of [WalletContractV4.create({ workchain: 0, publicKey: key }), WalletContractV5R1.create({ workchain: 0, publicKey: key })]) {
    it(`reads the key from a ${w.constructor.name} StateInit`, () => {
      const init = beginCell().store(storeStateInit(w.init)).endCell().toBoc().toString('base64')
      expect(publicKeyFromStateInit(w.address.toRawString(), init).publicKey).toBe(PUBKEY)
    })
  }
  it('refuses a StateInit that does not belong to the address', () => {
    const v4 = WalletContractV4.create({ workchain: 0, publicKey: key })
    const init = beginCell().store(storeStateInit(v4.init)).endCell().toBoc().toString('base64')
    // The signer of the vectors above IS this key's v4 wallet, so use the W5 address instead.
    expect(publicKeyFromStateInit(ADDRESS, init).publicKey).toBe(PUBKEY)
    const w5 = WalletContractV5R1.create({ workchain: 0, publicKey: key })
    expect(() => publicKeyFromStateInit(w5.address.toRawString(), init)).toThrow(/does not belong/)
  })
})
