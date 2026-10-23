import type { DnsItemData } from '~/lib/dns-read/core'
import { utcDate } from '~/lib/dns-read/core'
import { formatAmount } from '~/utils/units'

export type Tld = 'ton' | 't.me'

/** tonapi /v2/dns/auctions item. `date` is the auction end time; `owner` is the leading bidder for .ton (Fragment's contract for .t.me). */
export interface TaAuction {
  domain: string
  owner: string
  price: number
  bids: number
  date: number
}

export interface AuctionRow {
  domain: string
  /** Without the TLD. */
  name: string
  tld: Tld
  price: bigint
  bids: number
  endTime: number
  owner: string
  /** Bid, leader and end time were re-read from the domain contract (.ton only). */
  onChain?: boolean
}

export function toRows(data: TaAuction[], tld: Tld): AuctionRow[] {
  const suffix = `.${tld}`
  return data.map(a => ({
    domain: a.domain,
    name: a.domain.endsWith(suffix) ? a.domain.slice(0, -suffix.length) : a.domain,
    tld,
    price: BigInt(Math.round(a.price)),
    bids: a.bids,
    endTime: a.date,
    owner: a.owner
  }))
}

/**
 * Replaces tonapi's (possibly lagging) bid, leader and end time with the domain contract's own auction state.
 * `chain` is keyed by name; a name whose contract has no running auction is marked ended (endTime 0).
 */
export function withChainState(rows: AuctionRow[], chain: Map<string, DnsItemData | null>): AuctionRow[] {
  return rows.map((r) => {
    if (r.tld !== 'ton' || !chain.has(r.name)) return r
    const a = chain.get(r.name)?.auction
    if (!a) return { ...r, endTime: 0, onChain: true }
    return { ...r, price: a.bid, endTime: a.endTime, owner: a.bidder, onChain: true }
  })
}

export type Sort = 'ending' | 'newest' | 'price-asc' | 'price-desc' | 'bids' | 'shortest'

export interface Filters {
  q: string
  minLen?: number | null
  maxLen?: number | null
  sort: Sort
}

/** Keyword (substring of the name), length range and sort. Ended auctions (end time passed) are dropped. */
export function applyFilters(rows: AuctionRow[], f: Filters, now: number): AuctionRow[] {
  const q = f.q.trim().toLowerCase().replace(/\.(ton|t\.me)$/, '')
  const out = rows.filter(r => r.endTime > now
    && (!q || r.name.includes(q))
    && (!f.minLen || r.name.length >= f.minLen)
    && (!f.maxLen || r.name.length <= f.maxLen))
  const cmp: Record<Sort, (a: AuctionRow, b: AuctionRow) => number> = {
    'ending': (a, b) => a.endTime - b.endTime,
    'newest': (a, b) => b.endTime - a.endTime,
    'price-asc': (a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0),
    'price-desc': (a, b) => (a.price < b.price ? 1 : a.price > b.price ? -1 : 0),
    'bids': (a, b) => b.bids - a.bids,
    'shortest': (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)
  }
  return out.sort((a, b) => cmp[f.sort](a, b) || a.endTime - b.endTime)
}

/** Where to bid: dns.ton.org for .ton, Fragment for usernames. */
export function bidUrl(r: AuctionRow, testnet = false): string {
  return r.tld === 'ton'
    ? `https://dns.ton.org/${testnet ? '?testnet=true' : ''}#${encodeURIComponent(r.name)}`
    : `https://fragment.com/username/${encodeURIComponent(r.name)}`
}

export function csvRows(rows: AuctionRow[]) {
  return rows.map(r => ({ domain: r.domain, current_bid: formatAmount(r.price, 9, { group: false }), bids: r.bids, ends_utc: utcDate(r.endTime) }))
}
