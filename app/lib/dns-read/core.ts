// Shared, pure helpers for the "dns-read" tools (lookup, bulk availability, expiry, reverse, auctions).
// Ported from the official contracts: https://github.com/ton-blockchain/dns-contract/tree/main/func
// Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { Address, beginCell, Cell, contractAddress } from '@ton/core'

export type Net = 'mainnet' | 'testnet'

/** The .ton root collection ("TON DNS Domains"). Testnet address read from toncenter testnet (foundation.ton item). */
export const DNS_COLLECTION: Record<Net, string> = {
  mainnet: '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf',
  testnet: '0:e33ed33a42eb2032059f97d90c706f8400bb256d32139ca707f1564ad699c7dd'
}
/** Fragment's "Telegram Usernames" collection (mainnet), the home of .t.me names. */
export const TG_USERNAMES = '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2'

// dns-utils.fc / nft-item.fc constants (mainnet values).
export const ONE_YEAR = 31622400 // 366 days
export const ONE_MONTH = 2592000
export const AUCTION_START_TIME = 1659171600
export const ONE_TON = 1_000_000_000n

/** Strips spaces, a scheme, a trailing ".ton" and lowercases. "Foundation.TON " → "foundation". */
export function cleanName(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.ton$/, '')
}

/** Same rules as the collection (check_domain_string + length 4…126). Returns an error message or ''. */
export function nameError(name: string): string {
  if (!name) return 'Enter a name.'
  if (name.includes('.')) return 'Only second-level .ton names (like "alice.ton") can be registered; subdomains are managed by the owner.'
  if (name.length < 4) return 'Too short: a .ton name needs at least 4 characters.'
  if (name.length > 126) return 'Too long: at most 126 characters.'
  if (!/^[a-z0-9-]+$/.test(name)) return 'Only a–z, 0–9 and "-" are allowed.'
  if (name.startsWith('-') || name.endsWith('-')) return 'A name cannot start or end with "-".'
  return ''
}

/** NFT item index: slice_hash(domain) = representation hash of a cell holding the name bytes. */
export function domainIndex(name: string): bigint {
  return BigInt(`0x${beginCell().storeBuffer(Buffer.from(name, 'utf8')).endCell().hash().toString('hex')}`)
}

/** `nft_item_code` from the collection's data (storage: content:^Cell nft_item_code:^Cell). */
export function itemCodeFromCollectionData(dataBoc: string): Cell {
  const s = Cell.fromBase64(dataBoc).beginParse()
  s.loadRef()
  return s.loadRef()
}

/** Item address exactly as get_nft_address_by_index computes it (data = index:uint256 collection:MsgAddress). */
export function itemAddress(name: string, collection: string | Address, itemCode: Cell): Address {
  const coll = typeof collection === 'string' ? Address.parse(collection) : collection
  const data = beginCell().storeUint(domainIndex(name), 256).storeAddress(coll).endCell()
  return contractAddress(coll.workChain, { code: itemCode, data })
}

export interface AuctionInfo {
  /** Raw address of the current highest bidder. */
  bidder: string
  bid: bigint
  endTime: number
}

export interface DnsItemData {
  index: bigint
  /** false: deployed but never initialised (not seen on mainnet). */
  init: boolean
  /** Raw owner; null while an auction runs (zero address on-chain). */
  owner: string | null
  domain: string
  auction: AuctionInfo | null
  lastFillUpTime: number
}

/** Parses an item's persistent data (nft-item.fc load_data). Throws on malformed data. */
export function parseItemData(dataBoc: string): DnsItemData {
  const s = Cell.fromBase64(dataBoc).beginParse()
  const index = s.loadUintBig(256)
  s.loadAddress() // collection
  if (s.remainingBits === 0) return { index, init: false, owner: null, domain: '', auction: null, lastFillUpTime: 0 }
  const owner = s.loadMaybeAddress()
  s.loadRef() // content (DNS records dictionary)
  const dom = s.loadRef().beginParse()
  const domain = dom.loadBuffer(dom.remainingBits / 8).toString('utf8')
  const a = s.loadMaybeRef()?.beginParse()
  const auction = a ? { bidder: a.loadAddress().toRawString(), bid: a.loadCoins(), endTime: Number(a.loadUintBig(64)) } : null
  return { index, init: true, owner: owner?.toRawString() ?? null, domain, auction, lastFillUpTime: Number(s.loadUintBig(64)) }
}

/** Minimum opening bid for a name of `length` chars at `now` (dns-utils.fc get_min_price). */
export function minPrice(length: number, now = Math.floor(Date.now() / 1000)): bigint {
  const [start, end] = length === 4 ? [1000n, 100n] : length === 5 ? [500n, 50n] : length === 6 ? [400n, 40n] : length === 7 ? [300n, 30n] : length === 8 ? [200n, 20n] : length === 9 ? [100n, 10n] : length === 10 ? [50n, 5n] : [10n, 1n]
  const months = Math.floor((now - AUCTION_START_TIME) / ONE_MONTH)
  if (months > 21) return end * ONE_TON
  let p = start * ONE_TON
  for (let i = 0; i < months; i++) p = p * 90n / 100n
  return p
}

/** Smallest valid outbid: 5% above the current bid (muldiv rounds down). */
export const nextMinBid = (bid: bigint) => bid * 105n / 100n

export type DnsStatus =
  /** Never minted (or destroyed): anyone can open an auction at minPrice. */
  | { kind: 'available', minPrice: bigint }
  | { kind: 'auction', bidder: string, bid: bigint, endTime: number, nextBid: bigint }
  /** Owned. `won`: the auction ended but the winner has not touched the item yet (still owned by them). */
  | { kind: 'owned', owner: string, expiresAt: number, won: boolean }
  /** Not renewed for a year: anyone can send dns_balance_release with minPrice and start a new 1-week auction. */
  | { kind: 'expired', owner: string, expiresAt: number, minPrice: bigint }

/** Status of a name from its item data (null = account does not exist). */
export function dnsStatus(name: string, data: DnsItemData | null, now = Math.floor(Date.now() / 1000)): DnsStatus {
  if (!data || !data.init) return { kind: 'available', minPrice: minPrice(name.length, now) }
  if (data.auction && now <= data.auction.endTime) {
    return { kind: 'auction', bidder: data.auction.bidder, bid: data.auction.bid, endTime: data.auction.endTime, nextBid: nextMinBid(data.auction.bid) }
  }
  const won = !!data.auction
  const owner = won ? data.auction!.bidder : data.owner ?? ''
  const expiresAt = data.lastFillUpTime + ONE_YEAR
  // The release check needs auction == null on-chain; an unclaimed win is claimed by the same message, so it counts too.
  if (now > expiresAt) return { kind: 'expired', owner, expiresAt, minPrice: minPrice(name.length, now) }
  return { kind: 'owned', owner, expiresAt, won }
}

/** dns.ton.org page for a name (it reads the name from the hash, without ".ton"). */
export function dnsTonOrgUrl(name: string, network: Net = 'mainnet'): string {
  return `https://dns.ton.org/${network === 'testnet' ? '?testnet=true' : ''}#${encodeURIComponent(name)}`
}

/** Base64 (toncenter) → lowercase hex. */
export function b64ToHex(b64: string): string {
  return Buffer.from(b64, 'base64').toString('hex')
}

/** "3 d 4 h", "5 h 12 min", "expired". */
export function countdown(target: number, now = Math.floor(Date.now() / 1000)): string {
  let s = target - now
  if (s <= 0) return 'ended'
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  const m = Math.floor((s - h * 3600) / 60)
  if (d >= 1) return `${d} d ${h} h`
  if (h >= 1) return `${h} h ${m} min`
  return `${Math.max(m, 1)} min`
}

export const utcDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
