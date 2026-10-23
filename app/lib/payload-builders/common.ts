// Helpers shared by the payload-builder tools (jetton, NFT/SBT, external message, extra currency).
// Client/logic only: imports @ton/core.
import type { Address, Cell } from '@ton/core'
import { commentBody, parseBoc } from '~/utils/ton/messages'

export type PayloadKind = 'none' | 'comment' | 'boc'

export const PAYLOAD_KINDS = [
  { label: 'None', value: 'none' },
  { label: 'Text comment', value: 'comment' },
  { label: 'Custom BOC', value: 'boc' }
] satisfies { label: string, value: PayloadKind }[]

/** Forward payload / custom payload from the form. Throws a readable Error for a bad BOC. */
export function buildPayload(kind: PayloadKind, text: string): Cell | null {
  if (kind === 'none') return null
  if (kind === 'comment') return commentBody(text)
  return text.trim() ? parseBoc(text) : null
}

/** Optional BOC field: '' -> null. */
export function optionalBoc(text: string): Cell | null {
  return text.trim() ? parseBoc(text) : null
}

const U64 = (1n << 64n) - 1n

/** query_id:uint64 from decimal or 0x hex; '' -> 0. */
export function parseQueryId(input: string): bigint {
  const s = input.trim()
  if (!s) return 0n
  if (!/^(0x[0-9a-f]+|\d+)$/i.test(s)) throw new Error('Query id must be a whole number (decimal or 0x…)')
  const v = BigInt(s)
  if (v > U64) throw new Error('Query id must fit in 64 bits (max 18446744073709551615)')
  return v
}

export interface BocOut {
  base64: string
  hex: string
  /** Cell representation hash, hex. */
  hash: string
}

export function bocOut(cell: Cell): BocOut {
  const boc = cell.toBoc()
  return { base64: boc.toString('base64'), hex: boc.toString('hex'), hash: cell.hash().toString('hex') }
}

const b64url = (c: Cell) => c.toBoc().toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * ton://transfer deep link (Tonkeeper / TON wallets): amount in nano, body as base64url BOC in `bin`,
 * optional StateInit in `init`.
 */
export function transferLink(to: Address | string, amountNano: bigint, body?: Cell | null, init?: Cell | null, testOnly = false): string {
  const addr = typeof to === 'string' ? to : to.toString({ urlSafe: true, bounceable: true, testOnly })
  const q = new URLSearchParams({ amount: amountNano.toString() })
  if (body) q.set('bin', b64url(body))
  if (init) q.set('init', b64url(init))
  return `ton://transfer/${addr}?${q}`
}
