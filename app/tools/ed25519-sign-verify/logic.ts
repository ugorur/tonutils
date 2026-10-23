import { beginCell, Cell, domainDataToSign, signatureDomainPrefix } from '@ton/core'
import { keyPairFromSeed, mnemonicToPrivateKey, mnemonicValidate, sha256_sync, sign, signVerify } from '@ton/crypto'
import { Buffer } from 'buffer'
import { type InputFormat, parseBytes, parseFixedBytes } from '~/lib/crypto/bytes'

/**
 * data: sign the bytes as given.
 * cell: sign the 256-bit hash of a cell, the way wallets sign their external messages.
 * safe: @ton/core safeSign: sha256(0xffff ++ seed ++ cell hash), so the signature can never be replayed as a wallet message.
 */
export type SignMode = 'data' | 'cell' | 'safe'

export const DEFAULT_SAFE_SEED = 'ton-safe-sign-magic'

export interface MessageInput {
  mode: SignMode
  /** For mode 'data'. */
  data?: string
  format?: InputFormat
  /** For 'cell' and 'safe': base64 or hex BOC. */
  boc?: string
  /** For 'data' and 'cell': L2 signature domain (network global id). null = no domain (TON mainnet/testnet). */
  globalId?: number | null
  /** For 'safe'. */
  safeSeed?: string
}

export interface PreparedMessage {
  /** The exact bytes Ed25519 signs. */
  signed: Uint8Array
  cellHash?: Uint8Array
  /** sha256 of the signature domain, prepended to the data. */
  domainPrefix?: Uint8Array
}

export function parseCell(boc: string): Cell {
  const s = boc.trim()
  if (!s) throw new Error('Paste a BOC (base64 or hex).')
  const bytes = /^[0-9a-f\s]+$/i.test(s) && s.replace(/\s/g, '').length % 2 === 0 ? parseBytes(s, 'hex') : parseBytes(s, 'base64')
  try {
    return Cell.fromBoc(Buffer.from(bytes))[0]!
  }
  catch {
    throw new Error('This is not a valid BOC.')
  }
}

export function prepareMessage(m: MessageInput): PreparedMessage {
  if (m.mode === 'safe') {
    const seed = Buffer.from(m.safeSeed ?? DEFAULT_SAFE_SEED)
    if (seed.length < 8 || seed.length > 64) throw new Error('The safe-sign seed must be 8 to 64 bytes.')
    const cellHash = parseCell(m.boc ?? '').hash()
    return { signed: sha256_sync(Buffer.concat([Buffer.from([0xFF, 0xFF]), seed, cellHash])), cellHash }
  }
  let data: Buffer
  let cellHash: Uint8Array | undefined
  if (m.mode === 'cell') {
    cellHash = parseCell(m.boc ?? '').hash()
    data = Buffer.from(cellHash)
  }
  else {
    data = Buffer.from(parseBytes(m.data ?? '', m.format ?? 'utf8'))
  }
  if (m.globalId == null) return { signed: data, cellHash }
  if (Number.isNaN(m.globalId)) throw new Error('Enter the network global id.')
  if (!Number.isInteger(m.globalId) || m.globalId < -(2 ** 31) || m.globalId >= 2 ** 31) throw new Error('The global id must be a 32-bit signed integer.')
  const domain = { type: 'l2' as const, globalId: m.globalId }
  return { signed: domainDataToSign(data, domain), cellHash, domainPrefix: signatureDomainPrefix(domain) ?? undefined }
}

export interface Keys {
  /** 64 bytes: seed ++ public key (the @ton/crypto / TonWeb secretKey). */
  secretKey: Uint8Array
  publicKey: Uint8Array
  source: 'seed' | 'secret' | 'mnemonic'
}

/** Accepts a 32-byte private key (seed), a 64-byte secret key (seed ++ public key), hex or base64, or a 24-word TON mnemonic. */
export async function parsePrivateKey(input: string): Promise<Keys> {
  const words = input.trim().toLowerCase().split(/\s+/)
  if (words.length >= 12 && words.every(w => /^[a-z]+$/.test(w))) {
    if (!(await mnemonicValidate(words))) throw new Error('This is not a valid TON mnemonic (unknown word or bad checksum). BIP-39 phrases from other chains derive different keys.')
    const k = await mnemonicToPrivateKey(words)
    return { secretKey: k.secretKey, publicKey: k.publicKey, source: 'mnemonic' }
  }
  const s = input.trim().replace(/^0x/i, '').replace(/\s/g, '')
  const len = /^[0-9a-f]+$/i.test(s) ? s.length / 2 : Math.floor(s.replace(/=+$/, '').length * 3 / 4)
  if (len === 64) {
    const b = parseFixedBytes(s, 64, 'secret key')
    const k = keyPairFromSeed(Buffer.from(b.subarray(0, 32)))
    if (!k.publicKey.equals(Buffer.from(b.subarray(32)))) throw new Error('The last 32 bytes of this 64-byte key are not the public key of its first 32 bytes. The key is damaged or in another format.')
    return { secretKey: k.secretKey, publicKey: k.publicKey, source: 'secret' }
  }
  const k = keyPairFromSeed(Buffer.from(parseFixedBytes(s, 32, 'private key')))
  return { secretKey: k.secretKey, publicKey: k.publicKey, source: 'seed' }
}

export function signMessage(p: PreparedMessage, secretKey: Uint8Array): Uint8Array {
  return sign(Buffer.from(p.signed), Buffer.from(secretKey))
}

export function verifyMessage(p: PreparedMessage, signature: string | Uint8Array, publicKey: string | Uint8Array): boolean {
  const sig = typeof signature === 'string' ? parseFixedBytes(signature, 64, 'signature') : signature
  const pub = typeof publicKey === 'string' ? parseFixedBytes(publicKey, 32, 'public key') : publicKey
  return signVerify(Buffer.from(p.signed), Buffer.from(sig), Buffer.from(pub))
}

export interface WalletBodyCheck {
  /** v3/v4/highload v2 put the signature first; W5 (v5r1) puts it last. */
  layout: 'signature-first' | 'signature-last'
  valid: boolean
  signature: Uint8Array
  /** Hash of the signed remainder of the body. */
  signedHash: Uint8Array
}

/**
 * Verifies the signature inside a wallet external message body against a public key.
 * Tries both layouts and returns the one that verifies (or the signature-first result when neither does).
 */
export function verifyWalletBody(boc: string, publicKey: string, globalId: number | null = null): WalletBodyCheck {
  const cell = parseCell(boc)
  const pub = parseFixedBytes(publicKey, 32, 'public key')
  const bits = cell.bits.length
  if (bits < 512) throw new Error('This body is shorter than a signature (512 bits). Paste the external message body.')
  const results: WalletBodyCheck[] = []
  for (const layout of ['signature-first', 'signature-last'] as const) {
    const s = cell.beginParse()
    let signature: Buffer
    let rest: Cell
    if (layout === 'signature-first') {
      signature = s.loadBuffer(64)
      rest = s.asCell()
    }
    else {
      const head = s.loadBits(bits - 512)
      signature = s.loadBuffer(64)
      const b = beginCell().storeBits(head)
      for (const r of cell.refs) b.storeRef(r)
      rest = b.endCell()
    }
    const signedHash = rest.hash()
    const p = prepareMessage({ mode: 'data', data: signedHash.toString('hex'), format: 'hex', globalId })
    const valid = verifyMessage(p, signature, pub)
    results.push({ layout, valid, signature, signedHash })
    if (valid) return results.at(-1)!
  }
  return results[0]!
}
