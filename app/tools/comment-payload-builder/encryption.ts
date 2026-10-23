// Encrypted comments (op 0x2167da4b), compatible with Tonkeeper / MyTonWallet / toncenter ton-wallet.
// Algorithm: tonlib SimpleEncryptionV2 (ton-blockchain/ton tonlib/keys/SimpleEncryption.cpp), as implemented in
// mytonwallet src/api/chains/ton/util/encryption.ts:
//   shared  = X25519(clamp(sha512(seed)[0..32]), edwardsToMontgomery(their ed25519 public key))
//   prefix  = random bytes (16..31, first byte = its length) so that prefix+data is a multiple of 16
//   msgKey  = HMAC-SHA512(key = salt, prefix+data)[0..16]; salt = sender address, bounceable url-safe base64
//   x       = HMAC-SHA512(key = shared, msgKey); AES-256-CBC(key = x[0..32], iv = x[32..48]) without padding
//   payload = (myPub XOR theirPub) ‖ msgKey ‖ ciphertext, stored as op + snake cells (39 bytes in the root, then 127)
// Runs in the browser with WebCrypto (X25519, AES-CBC). Keys never leave this module.
import type { Address } from '@ton/core'
import { beginCell, Cell } from '@ton/core'
import { hmac_sha512, keyPairFromSeed, mnemonicToPrivateKey, mnemonicValidate, sha512 } from '@ton/crypto'

export const ENCRYPTED_COMMENT_OP = 0x2167da4b
const subtle = () => globalThis.crypto.subtle

// ---------------------------------------------------------------- curve helpers

const P = 2n ** 255n - 19n
const mod = (a: bigint) => ((a % P) + P) % P
function powMod(b: bigint, e: bigint): bigint {
  let r = 1n
  b = mod(b)
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P
    b = (b * b) % P
    e >>= 1n
  }
  return r
}
const leToBig = (b: Uint8Array) => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n)
function bigToLe(n: bigint): Uint8Array {
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++, n >>= 8n) out[i] = Number(n & 0xffn)
  return out
}

/** Ed25519 public key -> X25519 public key: u = (1 + y) / (1 - y) mod p (RFC 7748 §4.1 birational map). */
export function edToX25519Public(edPub: Uint8Array): Uint8Array {
  const y = leToBig(edPub) & ((1n << 255n) - 1n)
  return bigToLe(mod((1n + y) * powMod(1n - y, P - 2n)))
}

/** Ed25519 seed (32 bytes) -> clamped X25519 private scalar, as libsodium crypto_sign_ed25519_sk_to_curve25519. */
export async function x25519PrivateFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  const h = new Uint8Array(await sha512(Buffer.from(seed))).slice(0, 32)
  h[0]! &= 248
  h[31]! &= 127
  h[31]! |= 64
  return h
}

const PKCS8_X25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20])

/** X25519(scalar, u) through WebCrypto. */
export async function x25519(scalar: Uint8Array, u: Uint8Array): Promise<Uint8Array> {
  const s = subtle()
  const priv = await s.importKey('pkcs8', new Uint8Array([...PKCS8_X25519_PREFIX, ...scalar]), { name: 'X25519' }, false, ['deriveBits'])
  const pub = await s.importKey('raw', new Uint8Array(u), { name: 'X25519' }, false, [])
  return new Uint8Array(await s.deriveBits({ name: 'X25519', public: pub }, priv, 256))
}

export async function sharedSecret(mySeed: Uint8Array, theirEdPub: Uint8Array): Promise<Uint8Array> {
  return x25519(await x25519PrivateFromSeed(mySeed), edToX25519Public(theirEdPub))
}

// ---------------------------------------------------------------- AES-256-CBC without padding (WebCrypto always pads)

async function aesKey(key: Uint8Array) {
  return subtle().importKey('raw', new Uint8Array(key), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt'])
}

async function cbcEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const out = await subtle().encrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, await aesKey(key), new Uint8Array(data))
  return new Uint8Array(out).slice(0, data.length) // drop the PKCS#7 block
}

async function cbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await aesKey(key)
  // Append the block a PKCS#7 pad of 16×0x10 would encrypt to, so WebCrypto's padding check passes and strips it.
  const pad = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: data.slice(-16) }, k, new Uint8Array(16).fill(16))).slice(0, 16)
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: new Uint8Array(iv) }, k, new Uint8Array([...data, ...pad])))
}

const hmac = async (key: Uint8Array, data: Uint8Array) => new Uint8Array(await hmac_sha512(Buffer.from(key), Buffer.from(data)))
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])

// ---------------------------------------------------------------- salt + cell layout

/**
 * Salt string: the sender's address, bounceable, url-safe. Encrypt with the mainnet form on every network: MyTonWallet
 * (toBase64Address(addr, true)) and Tonkeeper (toString(bounceable, urlSafe)) do, and decrypt only with that form.
 */
export const saltFor = (sender: Address, testOnly = false) => sender.toString({ bounceable: true, urlSafe: true, testOnly })

const ROOT_BYTES = 39 // op (4) + 35 bytes, as toncenter ton-wallet / MyTonWallet pack it
const CELL_BYTES = 127

export function packEncrypted(payload: Uint8Array): Cell {
  const bytes = new Uint8Array([0x21, 0x67, 0xda, 0x4b, ...payload])
  const chunks: Uint8Array[] = [bytes.slice(0, ROOT_BYTES)]
  for (let i = ROOT_BYTES; i < bytes.length; i += CELL_BYTES) chunks.push(bytes.slice(i, i + CELL_BYTES))
  if (chunks.length > 17) throw new Error('Comment too long to encrypt (about 2 KB max)')
  let cell: Cell | null = null
  for (const c of chunks.reverse()) {
    const b = beginCell().storeBuffer(Buffer.from(c))
    cell = (cell ? b.storeRef(cell) : b).endCell()
  }
  return cell!
}

/** Encrypted payload bytes (after the op) from a body cell. Throws if it is not an encrypted comment. */
export function unpackEncrypted(cell: Cell): Uint8Array {
  const parts: number[] = []
  let c: Cell | undefined = cell
  while (c) {
    const s = c.beginParse()
    parts.push(...s.loadBuffer(s.remainingBits >> 3))
    c = c.refs[0]
  }
  const bytes = Uint8Array.from(parts)
  if (bytes.length < 4 || ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0 !== ENCRYPTED_COMMENT_OP) throw new Error('Not an encrypted comment (op 0x2167da4b)')
  const payload = bytes.slice(4)
  if (payload.length < 32 + 16 + 16 || (payload.length - 32) % 16 !== 0) throw new Error('Encrypted comment has an invalid length')
  return payload
}

// ---------------------------------------------------------------- public API

export interface CommentKeys {
  publicKey: Uint8Array
  /** 32-byte ed25519 seed (first half of the TON secret key). */
  seed: Uint8Array
}

/** 24 TON recovery words -> keys. The words stay in memory only. */
export async function keysFromMnemonic(phrase: string): Promise<CommentKeys> {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length !== 24) throw new Error(`Enter all 24 words of the recovery phrase (got ${words.length})`)
  if (!(await mnemonicValidate(words))) throw new Error('This is not a valid TON recovery phrase. Check the words and their order.')
  const kp = await mnemonicToPrivateKey(words)
  return { publicKey: new Uint8Array(kp.publicKey), seed: new Uint8Array(kp.secretKey.subarray(0, 32)) }
}

/** Keys from a 32-byte seed (tests, advanced users). */
export function keysFromSeed(seed: Uint8Array): CommentKeys {
  const kp = keyPairFromSeed(Buffer.from(seed))
  return { publicKey: new Uint8Array(kp.publicKey), seed: new Uint8Array(seed) }
}

export async function encryptComment(p: { text: string, keys: CommentKeys, theirPublicKey: Uint8Array, salt: string, random?: (n: number) => Uint8Array }): Promise<Cell> {
  if (!p.text) throw new Error('Enter a comment to encrypt')
  if (p.theirPublicKey.length !== 32) throw new Error('The recipient public key must be 32 bytes (64 hex characters)')
  const data = new TextEncoder().encode(p.text)
  const prefixLen = ((16 + 15 + data.length) & -16) - data.length
  const prefix = (p.random ?? (n => globalThis.crypto.getRandomValues(new Uint8Array(n))))(prefixLen)
  prefix[0] = prefixLen
  const plain = new Uint8Array([...prefix, ...data])
  const msgKey = (await hmac(new TextEncoder().encode(p.salt), plain)).slice(0, 16)
  const x = await hmac(await sharedSecret(p.keys.seed, p.theirPublicKey), msgKey)
  const cipher = await cbcEncrypt(x.slice(0, 32), x.slice(32, 48), plain)
  const pubXor = p.keys.publicKey.map((b, i) => b ^ p.theirPublicKey[i]!)
  return packEncrypted(new Uint8Array([...pubXor, ...msgKey, ...cipher]))
}

/**
 * Decrypts with the key of either side (sender or recipient). `salts` are tried in order: the sender address
 * in mainnet form and in testnet form, since wallets differ there. Throws 'wrong key or sender' on mismatch.
 */
export async function decryptComment(p: { body: Cell, keys: CommentKeys, salts: string[] }): Promise<{ text: string, otherPublicKey: Uint8Array, salt: string }> {
  const payload = unpackEncrypted(p.body)
  const otherPublicKey = payload.slice(0, 32).map((b, i) => b ^ p.keys.publicKey[i]!)
  const msgKey = payload.slice(32, 48)
  const x = await hmac(await sharedSecret(p.keys.seed, otherPublicKey), msgKey)
  const plain = await cbcDecrypt(x.slice(0, 32), x.slice(32, 48), payload.slice(48))
  for (const salt of p.salts) {
    if (!equal((await hmac(new TextEncoder().encode(salt), plain)).slice(0, 16), msgKey)) continue
    const prefixLen = plain[0]!
    if (prefixLen < 16 || prefixLen > plain.length) throw new Error('Decrypted data has an invalid prefix')
    return { text: new TextDecoder().decode(plain.slice(prefixLen)), otherPublicKey, salt }
  }
  throw new Error('Could not decrypt: this phrase is not the sender\'s or the recipient\'s, or the sender address is wrong.')
}
