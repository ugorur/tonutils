import { Cell } from '@ton/core'
import { formatAnonNumber } from '~/lib/telegram/fragment'

export type Query = { kind: 'username', name: string } | { kind: 'number', digits: string }

/**
 * Accepts "@name", "name", "t.me/name", "https://t.me/name", "name.t.me", or a +888 number in any spacing.
 * Throws a readable Error for anything else.
 */
export function parseQuery(input: string): Query {
  let s = input.trim()
  if (!s) throw new Error('Enter a username or a +888 number.')

  const digits = s.replace(/[\s()-]/g, '')
  if (/^\+?\d+$/.test(digits)) {
    const d = digits.replace(/^\+/, '')
    if (!d.startsWith('888')) throw new Error('Only anonymous +888 numbers are Telegram collectibles.')
    if (d.length < 7 || d.length > 15) throw new Error('A +888 number has 4 to 12 digits after 888.')
    return { kind: 'number', digits: d }
  }

  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(t\.me|telegram\.me|fragment\.com\/username)\//i, '').replace(/^@/, '').replace(/\.t\.me\/?$/i, '').replace(/[/?#].*$/, '')
  const name = s.toLowerCase()
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Usernames use only letters a–z, digits and underscores.')
  if (name.length < 4 || name.length > 32) throw new Error('Collectible usernames are 4 to 32 characters long.')
  if (!/^[a-z]/.test(name)) throw new Error('Telegram usernames start with a letter.')
  return { kind: 'username', name }
}

/** The text Fragment hashes: the lowercase username, or the number's digits. */
export const indexSource = (q: Query) => (q.kind === 'username' ? q.name : q.digits)

/** NFT item index = sha256(utf8 text) read as an unsigned 256-bit integer, as a decimal string. */
export async function itemIndex(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return BigInt('0x' + Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')).toString()
}

export const displayName = (q: Query) => (q.kind === 'username' ? `@${q.name}` : formatAnonNumber(q.digits))

/** toncenter /api/v3/runGetMethod stack entry. */
export interface StackEntry { type: string, value: unknown }

export interface AuctionState {
  /** Raw address of the highest bidder, null before the first bid. */
  bidder: string | null
  bid: bigint
  bidTime: number
  minBid: bigint
  endTime: number
}

function readAddress(e: StackEntry | undefined): string | null {
  if (!e || (e.type !== 'cell' && e.type !== 'slice') || typeof e.value !== 'string') return null // null address comes back as an empty list
  return Cell.fromBase64(e.value).beginParse().loadMaybeAddress()?.toRawString() ?? null
}

const num = (e: StackEntry | undefined) => BigInt((e?.value as string | undefined) ?? 0)

/**
 * Telemint item `get_telemint_auction_state` → (bidder, bid, bid_ts, min_bid, end_time).
 * Exit code 219 means no auction is running; returns null then.
 */
export function parseAuctionState(res: { exit_code: number, stack: StackEntry[] }): AuctionState | null {
  if (res.exit_code !== 0) return null
  const [bidder, bid, bidTs, minBid, end] = res.stack
  return { bidder: readAddress(bidder), bid: num(bid), bidTime: Number(num(bidTs)), minBid: num(minBid), endTime: Number(num(end)) }
}

export interface AuctionConfig {
  beneficiary: string | null
  initialMinBid: bigint
  /** Buy-now price; 0 = none. */
  maxBid: bigint
  /** Each bid must beat the previous one by this many percent. */
  minBidStepPercent: number
  /** A late bid extends the end to at least now + this many seconds. */
  minExtendTime: number
  duration: number
}

/** Telemint item `get_telemint_auction_config` → (beneficiary, initial_min_bid, max_bid, min_bid_step, min_extend_time, duration). */
export function parseAuctionConfig(res: { exit_code: number, stack: StackEntry[] }): AuctionConfig | null {
  if (res.exit_code !== 0) return null
  const [b, initial, max, step, extend, duration] = res.stack
  return { beneficiary: readAddress(b), initialMinBid: num(initial), maxBid: num(max), minBidStepPercent: Number(num(step)), minExtendTime: Number(num(extend)), duration: Number(num(duration)) }
}

/** "2d 4h", "3h 12m", "45m", "ended". */
export function timeLeft(endUnix: number, nowUnix = Math.floor(Date.now() / 1000)): string {
  const s = endUnix - nowUnix
  if (s <= 0) return 'ended'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.max(1, Math.floor((s % 3600) / 60))
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

/** tonapi `sale.price`: native coin or a jetton. */
export interface SalePrice { currency_type?: string, value: string, decimals?: number, token_name?: string }
export const saleSymbol = (p: SalePrice, coin: string) => (p.currency_type === 'native' || !p.token_name ? coin : p.token_name)
