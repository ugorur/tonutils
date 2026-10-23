import { crc16 } from '@ton/core'
import { Buffer } from 'buffer'
import { type ByteFormat, encodeBytes } from '~/lib/crypto/bytes'

export type HashAlgo = 'sha256' | 'sha512' | 'crc16' | 'crc32' | 'crc32c'

export const HASH_INFO: Record<HashAlgo, { label: string, hint: string }> = {
  sha256: { label: 'SHA-256', hint: 'Cell hashes, code hashes, TL-B and TEP content hashes, safeSign.' },
  sha512: { label: 'SHA-512', hint: 'Inside TON mnemonic key derivation and Ed25519.' },
  crc16: { label: 'CRC-16 (XMODEM)', hint: 'Friendly address checksum; get-method ids.' },
  crc32: { label: 'CRC-32 (IEEE)', hint: 'TL-B constructor tags and message op codes.' },
  crc32c: { label: 'CRC-32C (Castagnoli)', hint: 'Bag-of-cells (BOC) file checksum. A BOC stores these 4 bytes reversed (little-endian) at its end.' }
}
export const HASH_ALGOS = Object.keys(HASH_INFO) as HashAlgo[]

export type OutputFormat = Extract<ByteFormat, 'hex' | 'base64' | 'base64url' | 'decimal'>
export const OUTPUT_FORMATS: OutputFormat[] = ['hex', 'base64', 'base64url', 'decimal']

/** Byte-wise lookup table for a reflected CRC-32 polynomial. */
const reflectedTable = (poly: number) => Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? poly ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const CRC32_TABLE = reflectedTable(0xEDB88320)
const CRC32C_TABLE = reflectedTable(0x82F63B78)
const CRC16_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n << 8
  for (let k = 0; k < 8; k++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1
  return c & 0xFFFF
})

function crc32With(table: number[], data: Uint8Array): Uint8Array {
  let c = 0xFFFFFFFF
  for (const b of data) c = table[(c ^ b) & 0xFF]! ^ (c >>> 8)
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, (c ^ 0xFFFFFFFF) >>> 0)
  return out
}

/** CRC-32/ISO-HDLC (zlib, PNG), big-endian bytes. */
export const crc32 = (data: Uint8Array) => crc32With(CRC32_TABLE, data)

/**
 * Every digest, big-endian. SHA via WebCrypto and table CRCs, so a 100 MB file takes about a second
 * (the bit-by-bit @ton/core CRCs and pure-JS SHA took tens of seconds and froze the page).
 */
export async function hashAll(data: Uint8Array): Promise<Record<HashAlgo, Uint8Array>> {
  let c16 = 0
  for (const b of data) c16 = (CRC16_TABLE[((c16 >>> 8) ^ b) & 0xFF]! ^ (c16 << 8)) & 0xFFFF
  const [sha256, sha512] = await Promise.all(['SHA-256', 'SHA-512'].map(async h => new Uint8Array(await crypto.subtle.digest(h, data as BufferSource))))
  return { sha256: sha256!, sha512: sha512!, crc16: Uint8Array.of(c16 >>> 8, c16 & 0xFF), crc32: crc32(data), crc32c: crc32With(CRC32C_TABLE, data) }
}

/** TON get-method id: (crc16(name) & 0xffff) | 0x10000. */
export function methodId(name: string): number {
  const c = crc16(Buffer.from(name))
  return ((c[0]! << 8) | c[1]!) | 0x10000
}

/** TL-B op code from a crc32 of the scheme: the TEP-74 convention clears the top bit. */
export function tlbOp(crc: Uint8Array): number {
  return new DataView(crc.buffer, crc.byteOffset, 4).getUint32(0) & 0x7FFFFFFF
}

export const formatDigest = (d: Uint8Array, f: OutputFormat) => encodeBytes(d, f)!

/** Compares a pasted expected value with a digest in any output format (case-insensitive hex, either base64 alphabet). */
export function digestMatches(d: Uint8Array, expected: string): boolean {
  const e = expected.trim().replace(/^0x/i, '')
  if (!e) return false
  const norm = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return e.toLowerCase() === formatDigest(d, 'hex')
    || norm(e) === formatDigest(d, 'base64url')
    || e.replace(/[\s_,]/g, '') === formatDigest(d, 'decimal')
}

export type MacHash = 'SHA-256' | 'SHA-512'

/**
 * HMAC via WebCrypto (browser and Node 20+). WebCrypto rejects an empty key, but HMAC zero-pads the key
 * to the block size, so an empty key and a single 0x00 byte give the same MAC.
 */
export async function hmac(hash: MacHash, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', (key.length ? key : new Uint8Array(1)) as BufferSource, { name: 'HMAC', hash }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
}

export const PBKDF2_MAX_ITERATIONS = 10_000_000

/** PBKDF2-HMAC via WebCrypto. `length` in bytes. */
export async function pbkdf2(hash: MacHash, password: Uint8Array, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) throw new Error(`Iterations must be a whole number from 1 to ${PBKDF2_MAX_ITERATIONS.toLocaleString('en-US')}.`)
  if (!Number.isInteger(length) || length < 1 || length > 1024) throw new Error('Key length must be 1 to 1024 bytes.')
  const k = await crypto.subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash, salt: salt as BufferSource, iterations }, k, length * 8))
}
