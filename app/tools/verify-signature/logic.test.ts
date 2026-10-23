import { keyPairFromSeed, sha256_sync, sign } from '@ton/crypto'
import { describe, expect, it } from 'vitest'
import { EXAMPLE_PROOF, exampleSignData } from '~/lib/security-signing/examples'
import { resolvePublicKey, verifyProof } from '~/lib/security-signing/proof'
import { verifySignature } from '~/tools/sign-message/logic'
import { decodeBytes, detectBundle, parsePublicKey, parseSignature, verifyRaw } from './logic'

// RFC 8032 section 7.1, Ed25519 TEST 1 (empty message) and TEST 2 (one byte 0x72).
const RFC1 = {
  pk: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  msg: '',
  sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'
}
const RFC2 = {
  pk: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
  msg: '72',
  sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'
}

describe('raw Ed25519', () => {
  it('verifies the RFC 8032 vectors', () => {
    expect(verifyRaw(decodeBytes(RFC1.msg, 'hex'), parseSignature(RFC1.sig), RFC1.pk)).toBe('message')
    expect(verifyRaw(decodeBytes(RFC2.msg, 'hex'), parseSignature(RFC2.sig), RFC2.pk)).toBe('message')
    expect(verifyRaw(decodeBytes('73', 'hex'), parseSignature(RFC2.sig), RFC2.pk)).toBeNull()
    expect(verifyRaw(decodeBytes(RFC2.msg, 'hex'), parseSignature(RFC2.sig), RFC1.pk)).toBeNull()
  })
  it('accepts base64 signatures and keys', () => {
    const b64sig = Buffer.from(RFC2.sig, 'hex').toString('base64')
    const b64pk = Buffer.from(RFC2.pk, 'hex').toString('base64')
    expect(parsePublicKey(b64pk)).toBe(RFC2.pk)
    expect(verifyRaw(Buffer.from([0x72]), parseSignature(b64sig), parsePublicKey(b64pk)!)).toBe('message')
  })
  it('detects signatures over sha256(message)', () => {
    // Signed with @ton/crypto (tweetnacl) for the RFC 8032 TEST 1 secret key.
    const kp = keyPairFromSeed(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'))
    expect(kp.publicKey.toString('hex')).toBe(RFC1.pk)
    const msg = Buffer.from('I own this wallet', 'utf8')
    expect(verifyRaw(msg, sign(sha256_sync(msg), kp.secretKey), RFC1.pk)).toBe('sha256')
  })
  it('rejects malformed input', () => {
    expect(() => parseSignature('abcd')).toThrow(/64 bytes/)
    expect(() => decodeBytes('xyz', 'hex')).toThrow(/hex/)
    expect(() => decodeBytes('a b c !', 'base64')).toThrow(/base64/)
    expect(parsePublicKey('EQA3_JIJKDC0qauDUEQe2KjQj1iLwQRtrEREzmfDxbCKw9Kr')).toBeNull()
  })
})

describe('bundle detection', () => {
  it('routes a real ton_proof and verifies it', async () => {
    const d = detectBundle(JSON.stringify(EXAMPLE_PROOF))
    expect(d.kind).toBe('proof')
    if (d.kind !== 'proof') return
    const k = await resolvePublicKey(d.input, async () => null)
    expect(verifyProof(d.input, k.publicKey)).toBe(true)
  })
  it('routes a real signData bundle and verifies it', async () => {
    const d = detectBundle(JSON.stringify(exampleSignData()))
    expect(d.kind).toBe('signData')
    if (d.kind !== 'signData') return
    const k = await resolvePublicKey(d.bundle, async () => null)
    expect(k.source).toBe('stateinit')
    expect(verifySignature(d.bundle, k.publicKey)).toBe(true)
  })
  it('explains unknown JSON', () => {
    expect(() => detectBundle('nope')).toThrow(/JSON/)
    expect(() => detectBundle('{"foo":1}')).toThrow(/Missing fields/)
  })
})
