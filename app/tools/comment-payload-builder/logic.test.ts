// Vectors: real mainnet comment bodies (toncenter /api/v3/messages?opcode=0x00000000 and 0x2167da4b),
// libsodium test/default/ed25519_convert (Ed25519 -> X25519), RFC 7748 §6.1 (X25519),
// @ton/crypto mnemonic.spec.js (TON mnemonic -> key).
import { createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, randomBytes } from 'node:crypto'
import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { ENCRYPTED_COMMENT } from '../payload-decoder/vectors'
import { buildComment, decodeComment, decryptComment, edToX25519Public, encryptComment, keysFromMnemonic, keysFromSeed, packEncrypted, parsePublicKey, saltFor, unpackEncrypted, x25519, x25519PrivateFromSeed } from './logic'

const hex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'))
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')

const REAL = [
  // message 1MbHuVcne9dcP2+2Uubxpqswr/cYNJBSo5wPCCvVrQY=
  { text: '48670817', boc: 'te6cckEBAQEADgAAGAAAAAA0ODY3MDgxN/jENZs=' },
  // message fxBu/ULklyxYe5BqJUqhtRUVRYDmY+LXd0GcLsTSRkk= (UTF-8 split across two cells)
  { text: '@pgon - крипто-фиатный кошелек в ТГ. Пополни по СБП / выведи по СБП / Оплаты QR в магазине. Промокод - 3ABSA1BERAA8', boc: 'te6cckEBAgEAwQAB/gAAAABAcGdvbiAtINC60YDQuNC/0YLQvi3RhNC40LDRgtC90YvQuSDQutC+0YjQtdC70LXQuiDQsiDQotCTLiDQn9C+0L/QvtC70L3QuCDQv9C+INCh0JHQnyAvINCy0YvQstC10LTQuCDQv9C+INCh0JHQnyAvINCe0L/Qu9ABAHqw0YLRiyBRUiDQsiDQvNCw0LPQsNC30LjQvdC1LiDQn9GA0L7QvNC+0LrQvtC0IC0gM0FCU0ExQkVSQUE4Dg7tIA==' }
]

describe('text comments', () => {
  it.each(REAL)('builds the exact on-chain body for "$text"', ({ text, boc }) => {
    const b = buildComment(text)
    expect(b.hash).toBe(Cell.fromBase64(boc).hash().toString('hex'))
    expect(decodeComment(boc)).toEqual({ kind: 'text', text })
  })

  it('reports size', () => {
    const b = buildComment(REAL[1]!.text)
    expect(b.cells).toBe(2)
    expect(b.bytes).toBe(new TextEncoder().encode(REAL[1]!.text).length)
  })

  it('recognises other bodies', () => {
    expect(decodeComment('te6cckEBAQEAJgAASP////+vdQ00jdleCQACRmFhI/a+oNuYAZzmQ9AA+MvAts+WIrdmu4M=').kind).toBe('other')
  })
})

describe('key conversion', () => {
  it('Ed25519 -> X25519 matches libsodium (ed25519_convert.exp)', async () => {
    const seed = hex('421151a459faeade3d247115f94aedae42318124095afabe4d1451a559faedee')
    const keys = keysFromSeed(seed)
    expect(toHex(edToX25519Public(keys.publicKey))).toBe('f1814f0e8ff1043d8a44d25babff3cedcae6c22c3edaa48f857ae70de2baae50')
    const sk = await x25519PrivateFromSeed(seed)
    expect(toHex(sk)).toBe('8052030376d47112be7f73ed7a019293dd12ad910b654455798b4667d73de166')
    // X25519(sk, basepoint 9) must give the converted public key.
    const base = new Uint8Array(32)
    base[0] = 9
    expect(toHex(await x25519(sk, base))).toBe('f1814f0e8ff1043d8a44d25babff3cedcae6c22c3edaa48f857ae70de2baae50')
  })

  it('X25519 matches RFC 7748 §6.1', async () => {
    expect(toHex(await x25519(
      hex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'),
      hex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
    ))).toBe('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742')
  })

  it('TON mnemonic -> key matches @ton/crypto test vector', async () => {
    const k = await keysFromMnemonic('hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution')
    expect(toHex(k.seed)).toBe('9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97d')
    expect(toHex(k.publicKey)).toBe('f6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd')
    await expect(keysFromMnemonic('hospital stove')).rejects.toThrow(/24 words/)
  })
})

describe('encrypted comments', () => {
  const alice = keysFromSeed(hex('11'.repeat(32)))
  const bob = keysFromSeed(hex('22'.repeat(32)))
  const eve = keysFromSeed(hex('33'.repeat(32)))
  const aliceAddr = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
  const salts = [saltFor(aliceAddr), saltFor(aliceAddr, true)]

  it('keeps the real on-chain layout (message 5PrxfUlI…): unpack + pack is byte-identical', () => {
    const real = Cell.fromBase64(ENCRYPTED_COMMENT)
    const payload = unpackEncrypted(real)
    expect(payload.length).toBe(80) // 32 key xor + 16 msg key + 2 AES blocks
    expect(packEncrypted(payload).equals(real)).toBe(true)
    expect(decodeComment(ENCRYPTED_COMMENT)).toMatchObject({ kind: 'encrypted', payloadBytes: 80 })
  })

  it('recipient and sender can both decrypt; others cannot', async () => {
    const text = 'Order #42 · секрет ✓'
    const body = await encryptComment({ text, keys: alice, theirPublicKey: bob.publicKey, salt: saltFor(aliceAddr) })
    const byBob = await decryptComment({ body, keys: bob, salts })
    expect(byBob.text).toBe(text)
    expect(toHex(byBob.otherPublicKey)).toBe(toHex(alice.publicKey))
    expect((await decryptComment({ body, keys: alice, salts })).text).toBe(text)
    await expect(decryptComment({ body, keys: eve, salts })).rejects.toThrow(/Could not decrypt/)
    await expect(decryptComment({ body, keys: bob, salts: [saltFor(Address.parse('UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0p'))] })).resolves.toBeDefined() // UQ form still salts as bounceable
  })

  it('testnet-form salt is accepted too', async () => {
    const body = await encryptComment({ text: 'hi', keys: alice, theirPublicKey: bob.publicKey, salt: saltFor(aliceAddr, true) })
    expect((await decryptComment({ body, keys: bob, salts })).salt).toBe(saltFor(aliceAddr, true))
  })

  it('sizes and long texts', async () => {
    const short = await encryptComment({ text: 'hello', keys: alice, theirPublicKey: bob.publicKey, salt: 's', random: n => new Uint8Array(n) })
    expect(unpackEncrypted(short).length).toBe(32 + 16 + 32) // prefix 27 + 5 bytes = 2 blocks
    expect(short.bits.length).toBe(39 * 8)
    const long = 'x'.repeat(1000)
    const body = await encryptComment({ text: long, keys: alice, theirPublicKey: bob.publicKey, salt: 's' })
    expect((await decryptComment({ body, keys: bob, salts: ['s'] })).text).toBe(long)
  })

  // Independent implementation of MyTonWallet's encryption.ts / Tonkeeper Android CommentEncryption.kt on node:crypto:
  // OpenSSL X25519 (their X25519 public key derived from their private scalar, not from our Ed25519 conversion),
  // HMAC-SHA512 and AES-256-CBC without padding (no WebCrypto padding tricks).
  describe('cross-check with an independent node:crypto implementation', () => {
    const x25519Key = async (seed: Uint8Array) => {
      const sk = await x25519PrivateFromSeed(seed)
      const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), sk]), format: 'der', type: 'pkcs8' })
      return { priv, pub: createPublicKey(priv) }
    }
    const shared = async (mySeed: Uint8Array, theirSeed: Uint8Array) =>
      diffieHellman({ privateKey: (await x25519Key(mySeed)).priv, publicKey: (await x25519Key(theirSeed)).pub })
    const hm = (k: Uint8Array, d: Uint8Array) => createHmac('sha512', k).update(d).digest()
    const aes = (enc: boolean, x: Buffer, d: Uint8Array) => {
      const c = enc ? createCipheriv('aes-256-cbc', x.subarray(0, 32), x.subarray(32, 48)) : createDecipheriv('aes-256-cbc', x.subarray(0, 32), x.subarray(32, 48))
      c.setAutoPadding(false)
      return Buffer.concat([c.update(d), c.final()])
    }
    const salt = Buffer.from(aliceAddr.toString({ bounceable: true, urlSafe: true }))
    const aliceSeed = hex('11'.repeat(32))
    const bobSeed = hex('22'.repeat(32))

    it('their X25519 public key equals our Ed25519 -> X25519 conversion', async () => {
      const spki = (await x25519Key(bobSeed)).pub.export({ format: 'der', type: 'spki' })
      expect(toHex(spki.subarray(-32))).toBe(toHex(edToX25519Public(bob.publicKey)))
    })

    it('node-encrypted comment decrypts with our code', async () => {
      const data = Buffer.from('Paid in full, thanks!')
      const prefixLen = ((16 + 15 + data.length) & -16) - data.length
      const prefix = randomBytes(prefixLen)
      prefix[0] = prefixLen
      const plainBytes = Buffer.concat([prefix, data])
      const msgKey = hm(salt, plainBytes).subarray(0, 16)
      const cipher = aes(true, hm(await shared(aliceSeed, bobSeed), msgKey), plainBytes)
      const xor = alice.publicKey.map((b, i) => b ^ bob.publicKey[i]!)
      const body = packEncrypted(Buffer.concat([xor, msgKey, cipher]))
      expect((await decryptComment({ body, keys: bob, salts: [saltFor(aliceAddr)] })).text).toBe('Paid in full, thanks!')
    })

    it('our encrypted comment decrypts with node', async () => {
      const body = await encryptComment({ text: 'Invoice 1042 ✓', keys: alice, theirPublicKey: bob.publicKey, salt: saltFor(aliceAddr) })
      const payload = Buffer.from(unpackEncrypted(body))
      const msgKey = payload.subarray(32, 48)
      const plainBytes = aes(false, hm(await shared(bobSeed, aliceSeed), msgKey), payload.subarray(48))
      expect(hm(salt, plainBytes).subarray(0, 16).equals(msgKey)).toBe(true)
      expect(plainBytes.subarray(plainBytes[0]!).toString()).toBe('Invoice 1042 ✓')
    })
  })

  it('validates input', async () => {
    expect(() => parsePublicKey('abc')).toThrow(/64 hex/)
    expect(() => unpackEncrypted(buildComment('plain').cell)).toThrow(/Not an encrypted comment/)
  })
})
