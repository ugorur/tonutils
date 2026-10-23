// Wallet version detection: classify the input, hash the code (resolving library cells), parse the data.
import type { Cell } from '@ton/core'
import { Address } from '@ton/core'
import { parseBoc } from '~/utils/ton/messages'
import { WALLET_CODE_HASHES } from '~/utils/ton/wallets'

export type { AccountReport, CodeInfo } from '~/lib/wallet-detection/state'
export { inspectAccount, inspectCode, inspectHash } from '~/lib/wallet-detection/state'

export type DetectorInput =
  | { kind: 'address', address: Address }
  | { kind: 'hash', hashHex: string }
  | { kind: 'code', code: Cell }

/** Address, 32-byte code hash (hex / base64), or a code BOC. */
export function classifyInput(raw: string): DetectorInput {
  const s = raw.trim()
  if (!s) throw new Error('Paste an address, a code hash or a code BOC')
  if (Address.isFriendly(s) || Address.isRaw(s)) return { kind: 'address', address: Address.parse(s) }
  if (/^(0x)?[0-9a-f]{64}$/i.test(s)) return { kind: 'hash', hashHex: s.replace(/^0x/i, '').toLowerCase() }
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) {
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (b.length === 32) return { kind: 'hash', hashHex: b.toString('hex') }
  }
  try {
    return { kind: 'code', code: parseBoc(s) }
  }
  catch {
    throw new Error('Not an address, a 32-byte hash or a valid BOC')
  }
}

/** The reference table: one row per known code hash. */
export function codeHashTable() {
  return Object.entries(WALLET_CODE_HASHES).map(([b64, k]) => ({
    label: k.label,
    version: k.version,
    base64: b64,
    hex: Buffer.from(b64, 'base64').toString('hex')
  }))
}
