// Small cell helpers shared by the boc-advanced tools (dictionary-codec, merkle-proof-tool,
// tvm-stack-codec, stateinit-builder). Pure TS; needs Buffer (client or vitest).
import { Address, Cell } from '@ton/core'

/** Base64, base64url or hex bytes → Buffer. */
export function decodeBytes(input: string): Buffer {
  const s = input.trim().replace(/\s+/g, '')
  if (/^(0x)?[0-9a-f]+$/i.test(s) && s.length % 2 === 0) return Buffer.from(s.replace(/^0x/i, ''), 'hex')
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(s)) throw new Error('Not base64 or hex')
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Parses one BOC (base64/base64url/hex). Unlike messages.parseBoc it keeps the library's reason, which matters
 * for exotic cells: a Merkle proof whose stored hash does not match its content is rejected here with that detail.
 */
export function parseCell(input: string, what = 'BOC'): Cell {
  const s = input.trim()
  if (!s) throw new Error(`Paste a ${what} (base64 or hex)`)
  let bytes: Buffer
  try {
    bytes = decodeBytes(s)
  }
  catch {
    throw new Error(`${what} is not valid base64 (te6cc…) or hex (b5ee9c72…)`)
  }
  try {
    const cells = Cell.fromBoc(bytes)
    if (!cells[0]) throw new Error('no root cell')
    return cells[0]
  }
  catch (e) {
    throw new Error(`${what} could not be parsed: ${(e as Error).message}`)
  }
}

export const toB64 = (c: Cell) => c.toBoc().toString('base64')
export const toHex = (c: Cell) => c.toBoc().toString('hex')
export const hashHex = (c: Cell) => c.hash().toString('hex')

/** Integer from decimal, 0x-hex or -0x-hex (BigInt('-0x1') throws, toncenter returns that form). */
export function parseInteger(input: string | number | bigint, what = 'Number'): bigint {
  if (typeof input === 'bigint') return input
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input)) throw new Error(`${what}: ${input} is not a safe integer, pass it as a string`)
    return BigInt(input)
  }
  const s = input.trim().replace(/_/g, '')
  const m = /^(-?)(0x[0-9a-f]+|\d+)$/i.exec(s)
  if (!m) throw new Error(`${what}: "${input}" is not an integer (decimal or 0x-hex)`)
  const v = BigInt(m[2]!)
  return m[1] ? -v : v
}

/** 0x-hex like toncenter/tonapi: 0x17bc…, -0x1. */
export function toHexNum(v: bigint): string {
  return v < 0n ? `-0x${(-v).toString(16)}` : `0x${v.toString(16)}`
}

/** 32-byte hash from hex (0x optional, short hex is left-padded like a get-method number) or base64. */
export function parseHash(input: string): Buffer {
  const s = input.trim()
  if (/^0x[0-9a-f]{1,64}$/i.test(s) || /^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s.replace(/^0x/i, '').padStart(64, '0'), 'hex')
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (/^\d+$/.test(s)) {
    const v = BigInt(s)
    if (v < 1n << 256n) return Buffer.from(v.toString(16).padStart(64, '0'), 'hex')
  }
  throw new Error('Hash must be 64 hex characters, 0x-hex, base64 or a decimal 256-bit number')
}

/** If the cell is exactly one MsgAddressInt (267 bits, no refs), returns it. */
export function cellAsAddress(c: Cell): Address | null {
  if (c.bits.length !== 267 || c.refs.length) return null
  try {
    return c.beginParse().loadAddress()
  }
  catch {
    return null
  }
}
