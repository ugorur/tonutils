// Shared, pure helpers for the "jettons-read" tools (info, holders, history, wallet address, wallet status).
// Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { Address } from '@ton/core'
import { jettonDecimals } from '~/utils/ton/jetton'

/** Lowercase raw "0:abc…". Throws on invalid input. */
export function toRaw(address: string | Address): string {
  const a = typeof address === 'string' ? Address.parse(address.trim()) : address
  return a.toRawString().toLowerCase()
}

/** Friendly form: contracts (masters, jetton wallets) bounceable EQ…, user wallets non-bounceable UQ…. */
export function friendly(address: string, { bounceable = true, testnet = false } = {}): string {
  return Address.parse(address.trim()).toString({ bounceable, testOnly: testnet, urlSafe: true })
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  try {
    return Address.parse(a.trim()).equals(Address.parse(b.trim()))
  }
  catch {
    return false
  }
}

/** The all-zero address (EQAAAA…M9c / UQAAAA…JKZ) has no key: tokens sent there are gone for good. */
export const ZERO_RAW = `0:${'0'.repeat(64)}`

/** No admin (null or the zero address): nobody can mint, change metadata or lock wallets any more. */
export function isRenounced(admin: string | null | undefined): boolean {
  return !admin || sameAddress(admin, ZERO_RAW)
}

/** tonapi account reference (owner, sender, recipient …). */
export interface TonapiAccountRef {
  address: string
  name?: string
  is_scam?: boolean
  is_wallet?: boolean
  icon?: string
}

export type Verification = 'whitelist' | 'blacklist' | 'none' | string

/** tonapi GET /v2/jettons/{master}. */
export interface TonapiJetton {
  mintable: boolean
  total_supply: string
  admin?: TonapiAccountRef
  metadata: {
    address: string
    name?: string
    symbol?: string
    decimals?: string
    image?: string
    description?: string
    social?: string[]
    websites?: string[]
  }
  preview?: string
  verification: Verification
  holders_count: number
}

/** The bits every tool needs to print amounts of one jetton. */
export interface JettonBasics {
  raw: string
  name: string
  symbol: string
  decimals: number
  image?: string
  verification: Verification
}

export function jettonBasics(j: TonapiJetton): JettonBasics {
  return {
    raw: j.metadata.address.toLowerCase(),
    name: j.metadata.name || 'Unnamed token',
    symbol: j.metadata.symbol || '?',
    decimals: jettonDecimals(j.metadata),
    image: j.preview || j.metadata.image,
    verification: j.verification
  }
}

export const VERIFICATION_INFO: Record<string, { label: string, color: 'success' | 'error' | 'warning', text: string }> = {
  whitelist: { label: 'Verified', color: 'success', text: 'Listed as genuine in the Tonkeeper / tonapi token list.' },
  blacklist: { label: 'Scam', color: 'error', text: 'Flagged as a scam or impersonation by tonapi. Do not buy or interact with it.' },
  none: { label: 'Unverified', color: 'warning', text: 'Not reviewed. Anyone can create a token with any name and logo: always check the master address.' }
}

export function verificationInfo(v: Verification) {
  return VERIFICATION_INFO[v] ?? VERIFICATION_INFO.none!
}

/** "1712345678" (unix s) -> "2024-04-05 18:54" in the viewer's local time. */
export function formatTime(unix: number): string {
  const d = new Date(unix * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
