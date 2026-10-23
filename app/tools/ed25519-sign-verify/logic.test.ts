import { safeSignVerify } from '@ton/core'
import { Buffer } from 'buffer'
import { describe, expect, it } from 'vitest'
import { toHex } from '~/lib/crypto/bytes'
import { parseCell, parsePrivateKey, prepareMessage, signMessage, verifyMessage, verifyWalletBody } from './logic'

// RFC 8032 section 7.1, TEST 1 and TEST 2.
const RFC1 = {
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  pub: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'
}
const RFC2 = {
  seed: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
  pub: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  msg: '72',
  sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'
}

// Data cell of mainnet wallet demigods.ton (0:ce3a368f…87f5), toncenter /api/v3/account;
// its hash is `data_hash` from toncenter /api/v3/accountStates.
const DATA_BOC = 'te6ccgEBAQEAKwAAUQAAA18pqaMXPomC51TnDxpIig5AH5/g+Fg2j85HED6NPfTNGsOZesdA'
const DATA_HASH = Buffer.from('Yyq7ZvsHbI5js8cC+JoOa9LGDmiXvb5IuSMfZfSMgD0=', 'base64').toString('hex')

// Expected signatures below were produced with OpenSSL 3 (`openssl pkeyutl -sign -rawin`) using the RFC TEST 1 key.
const OSSL = {
  hello: 'ccbde075d0a66ac452294d63a159b07a8a3a6fc7ef79c55cc5621eb76df107186c1c64ec2d7e215afe2f4beca613d360b7dfea61315db11b05595cef97753a07',
  cell: 'ff7d6d4a2df1effccc8c5410456b5013948c1fb981aa58f3d8e1004daf799f0838c3dadce6e76b66c805897e6e6e4f8f912cc83688caa42399acdaa04be5a90c',
  // sha256(int32le(0x71b34ee1) ++ int32le(2000)) ++ data hash
  cellDomain2000: '04bf9143cc20da9759852fe7edc1c2b97d7bf7d1a3b3a7706cb59e2515c0d3caa8292179595bea6ec5a0ba61d22391b73fa54cb277001faf37f7f179a31daa01',
  // sha256(ff ff ++ "ton-safe-sign-magic" ++ data hash), computed with Python hashlib
  safeDigest: 'ab4c7d67f306bd87d5b040fcb1971f1a2f4b9c4eb845f23e7db9a5a65da52635',
  safe: '70ac274ef7afd08a8278bc6d11275f9884b512a622ad10121b46ae716a8db5773af67ee5864d236c33edc4f923ef06ee42f443ff9db354b256126b4b82066e03'
}

describe('keys', () => {
  it('derives the RFC 8032 public key from a 32-byte seed (hex and base64)', async () => {
    expect(toHex((await parsePrivateKey(RFC1.seed)).publicKey)).toBe(RFC1.pub)
    expect(toHex((await parsePrivateKey(Buffer.from(RFC2.seed, 'hex').toString('base64'))).publicKey)).toBe(RFC2.pub)
  })

  it('accepts a 64-byte secret key and rejects a mismatched one', async () => {
    const k = await parsePrivateKey(`0x${RFC1.seed}${RFC1.pub}`)
    expect(k.source).toBe('secret')
    await expect(parsePrivateKey(RFC1.seed + RFC2.pub)).rejects.toThrow(/not the public key/)
  })

  it('derives keys from a TON mnemonic (ton-crypto mnemonic.spec.ts vector)', async () => {
    const words = 'hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution'
    const k = await parsePrivateKey(words)
    expect(k.source).toBe('mnemonic')
    expect(toHex(k.secretKey)).toBe('9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97df6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd')
    await expect(parsePrivateKey(words.replace('hospital', 'stove'))).rejects.toThrow(/not a valid TON mnemonic/)
  })

  it('rejects wrong lengths', async () => {
    await expect(parsePrivateKey('abcd')).rejects.toThrow(/32 bytes/)
    await expect(parsePrivateKey('')).rejects.toThrow(/Enter the private key/)
  })
})

describe('sign and verify', () => {
  it('matches RFC 8032 TEST 1 (empty message) and TEST 2', async () => {
    const k1 = await parsePrivateKey(RFC1.seed)
    const p1 = prepareMessage({ mode: 'data', data: '', format: 'hex' })
    expect(toHex(signMessage(p1, k1.secretKey))).toBe(RFC1.sig)
    expect(verifyMessage(p1, RFC1.sig, RFC1.pub)).toBe(true)

    const k2 = await parsePrivateKey(RFC2.seed)
    const p2 = prepareMessage({ mode: 'data', data: RFC2.msg, format: 'hex' })
    expect(toHex(signMessage(p2, k2.secretKey))).toBe(RFC2.sig)
    expect(verifyMessage(p2, Buffer.from(RFC2.sig, 'hex').toString('base64'), RFC2.pub)).toBe(true)
    expect(verifyMessage(p2, RFC2.sig, RFC1.pub)).toBe(false)
    expect(verifyMessage(prepareMessage({ mode: 'data', data: '73', format: 'hex' }), RFC2.sig, RFC2.pub)).toBe(false)
  })

  it('signs UTF-8 text like OpenSSL', async () => {
    const k = await parsePrivateKey(RFC1.seed)
    expect(toHex(signMessage(prepareMessage({ mode: 'data', data: 'Hello, TON!', format: 'utf8' }), k.secretKey))).toBe(OSSL.hello)
  })

  it('matches the ton-core domainSignature.spec.ts vector (L2 global id 2000)', async () => {
    const k = await parsePrivateKey('1e0ab9c5f92106c2055239dd319805cd928ab894a53dd2b2086bef2cc201c3a8')
    const p = prepareMessage({ mode: 'data', data: 'Hello world!', format: 'utf8', globalId: 2000 })
    expect(toHex(signMessage(p, k.secretKey))).toBe('335ff7f73e9be8d18ce4bc5c49be435cc442c27374b8323e2c3f5ac9b991f270256d7421e448e4a7e6b95751c1a807bc463d8742f14523736d021443ab630200')
    expect(verifyMessage(prepareMessage({ mode: 'data', data: 'Hello world!', format: 'utf8' }), signMessage(p, k.secretKey), k.publicKey)).toBe(false)
  })

  it('signs a cell hash (real mainnet data cell), with and without a domain', async () => {
    expect(toHex(parseCell(DATA_BOC).hash())).toBe(DATA_HASH)
    const k = await parsePrivateKey(RFC1.seed)
    const p = prepareMessage({ mode: 'cell', boc: DATA_BOC })
    expect(toHex(p.signed)).toBe(DATA_HASH)
    expect(toHex(signMessage(p, k.secretKey))).toBe(OSSL.cell)
    const pd = prepareMessage({ mode: 'cell', boc: Buffer.from(DATA_BOC, 'base64').toString('hex'), globalId: 2000 })
    expect(toHex(pd.domainPrefix!)).toBe('f44a55ca87469fc1c8a881d452f862a56fe439e38e179dd599f5db1bcd63a2c8')
    expect(toHex(signMessage(pd, k.secretKey))).toBe(OSSL.cellDomain2000)
  })

  it('safe-signs a cell like OpenSSL and @ton/core safeSignVerify agrees', async () => {
    const k = await parsePrivateKey(RFC1.seed)
    const p = prepareMessage({ mode: 'safe', boc: DATA_BOC })
    expect(toHex(p.signed)).toBe(OSSL.safeDigest)
    const sig = signMessage(p, k.secretKey)
    expect(toHex(sig)).toBe(OSSL.safe)
    expect(safeSignVerify(parseCell(DATA_BOC), Buffer.from(sig), Buffer.from(k.publicKey))).toBe(true)
    expect(() => prepareMessage({ mode: 'safe', boc: DATA_BOC, safeSeed: 'short' })).toThrow(/8 to 64/)
  })

  it('rejects bad input', () => {
    expect(() => prepareMessage({ mode: 'cell', boc: 'te6ccgEB' })).toThrow(/not a valid BOC/)
    expect(() => prepareMessage({ mode: 'data', data: '', format: 'utf8', globalId: 2 ** 31 })).toThrow(/32-bit/)
    expect(() => verifyMessage(prepareMessage({ mode: 'data', data: '' }), 'abcd', RFC1.pub)).toThrow(/64 bytes/)
  })
})

describe('verifyWalletBody (real mainnet external messages)', () => {
  it('verifies a wallet v4r2 transfer (signature first)', () => {
    // tx ic5v6rptswpKyqaAAWAHbgYTCrMRZOvD7mJUFQJRb08= of demigods.ton (toncenter /api/v3/transactions);
    // public key from get_public_key (toncenter /api/v3/runGetMethod).
    const body = 'te6cckEBAgEAogABnBD3pBjkMH78vDEEyRefSXgIxZVY136q872j2lEQQF4CiofJQHeJfyxl3YLAfLMMkCRIw+4h2LA/Hm95vuvTnAUpqaMXatkkfgAAA14AAwEAnkIAMSTIUU8hSyp59rCJMJqa9B1yYMdc2bMi4io529ubAJ4o+3UEMAAAAAAAAAAAAAAAAAAAAAAAAFQ2RVhzUk12cjNuWmpweDRRcGJ4NDFKpfgX'
    const pub = '3e8982e754e70f1a488a0e401f9fe0f858368fce47103e8d3df4cd1ac3997ac7'
    const r = verifyWalletBody(body, pub)
    expect(r).toMatchObject({ layout: 'signature-first', valid: true })
    expect(verifyWalletBody(body, RFC1.pub).valid).toBe(false)
  })

  it('verifies a wallet W5 (v5r1) transfer (signature last)', () => {
    // tx Bk9TPVUVClrmIy/hVZI2f4SpkPFmjt9IfQtoZ5aSqBM= of 0:a0010232…ecb8 (toncenter /api/v3/transactions, interfaces wallet_v5r1).
    const body = 'te6cckEBBAEAuwABoXNpZ25///8RattiQgAId/CaytBXr5Q/ugNSoqqxu56rszUH0hrdUU9NxK6SKyn8/q+NDPH6yQNgW7tFOe69jyx8AcRXL90gnjT1Ub63PwPAYAECCg7DyG0DAgMAAAC0QgBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHSIiQ8AAAAAAAAAAAAAAAAAAAAAAAAAxMDAgVGVsZWdyYW0gU3RhcnMgCgpSZWYjZk5qNjNOUmJLe+ue7Q=='
    const pub = '8fc4001eb32ddbda7e233d921acbb07654bc64f24e4cf2959e019176f81d025e'
    expect(verifyWalletBody(body, pub)).toMatchObject({ layout: 'signature-last', valid: true })
  })
})
