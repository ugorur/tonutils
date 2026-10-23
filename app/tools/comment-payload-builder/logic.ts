// Text comment payloads (text_comment#00000000 text:SnakeData) and decoding. Encryption lives in encryption.ts.
import type { Cell } from '@ton/core'
import { commentBody, decodeBody, parseBoc } from '~/utils/ton/messages'
import { ENCRYPTED_COMMENT_OP, unpackEncrypted } from './encryption'

export * from './encryption'

function countCells(c: Cell): number {
  return 1 + c.refs.reduce((n, r) => n + countCells(r), 0)
}

export function buildComment(text: string) {
  const cell = commentBody(text)
  const boc = cell.toBoc()
  return {
    cell,
    base64: boc.toString('base64'),
    hex: boc.toString('hex'),
    hash: cell.hash().toString('hex'),
    bytes: new TextEncoder().encode(text).length,
    cells: countCells(cell)
  }
}

export type DecodedComment
  = | { kind: 'text', text: string }
    | { kind: 'encrypted', cell: Cell, payloadBytes: number }
    | { kind: 'other', title: string, opHex: string | null }

export function decodeComment(input: string): DecodedComment {
  const cell = parseBoc(input)
  const s = cell.beginParse()
  if (s.remainingBits >= 32 && s.preloadUint(32) === ENCRYPTED_COMMENT_OP) return { kind: 'encrypted', cell, payloadBytes: unpackEncrypted(cell).length }
  const d = decodeBody(cell)
  if (d.name === 'text_comment' && !d.error) return { kind: 'text', text: String(d.fields.text) }
  return { kind: 'other', title: d.title, opHex: d.opHex }
}

/** 64 hex chars -> 32 bytes. */
export function parsePublicKey(hex: string): Uint8Array {
  const h = hex.trim().replace(/^0x/i, '')
  if (!/^[0-9a-f]{64}$/i.test(h)) throw new Error('A public key is 64 hex characters (32 bytes)')
  return Uint8Array.from(Buffer.from(h, 'hex'))
}
