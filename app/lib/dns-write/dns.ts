// .ton DNS (TEP-81) for the dns-write tools: domain names, item addresses, item state, record cells and owner messages.
// Follows github.com/ton-blockchain/dns-contract (func/nft-item.fc, nft-collection.fc, dns-utils.fc).
// Pure TS + @ton/core: client / vitest only.
import { Address, beginCell, Cell, contractAddress, Dictionary } from '@ton/core'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { V3Fetch } from '~/utils/api-client'

/** The .ton collection (root DNS resolves "ton" here). Testnet one read from config param 4 → dnsresolve("ton"). */
export const DNS_COLLECTION: Record<TonNetwork, string> = {
  mainnet: 'EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz',
  testnet: 'EQDjPtM6QusgMgWfl9kMcG-EALslbTITnKcH8VZK1pnH3UZA'
}

// dns-utils.fc / nft-item.fc constants (mainnet values).
export const ONE_YEAR = 31_622_400
export const ONE_MONTH = 2_592_000
export const AUCTION_START_TIME = 1_659_171_600
export const AUCTION_PROLONGATION = 3600
export const RELEASE_AUCTION_DURATION = 604_800
export const OP_CHANGE_DNS_RECORD = 0x4eb1f0f9
export const OP_DNS_BALANCE_RELEASE = 0x4ed14b65

/** What owners attach in practice (dns.ton.org-style txs on fire.ton / maybe.ton items): 0.02 renew, 0.05 record edit. Unused gas stays on the item. */
export const RENEW_AMOUNT = 20_000_000n
export const EDIT_AMOUNT = 50_000_000n

/** Record keys: sha256 of the category name (TEP-81). Key 0 is never used by resolvers. */
export const RECORD_KEYS = {
  wallet: 0xE8D44050873DBA865AA7C170AB4CCE64D90839A34DCFD6CF71D14E0205443B1Bn,
  site: 0xFBAE041B02C41ED0FD8A4EFB039BC780DD6AF4A1F0C420F42561AE705DDA43FEn,
  storage: 0x49A25F9FEEFAFFECAD0FCD30C50DC9331CFF8B55ECE53DEF6285C09E17E6F5D7n,
  dns_next_resolver: 0x19F02441EE588FDB26EE24B2568DD035C3C9206E11AB979BE62E55558A1D17FFn
} as const
export type RecordCategory = keyof typeof RECORD_KEYS

// ------------------------------------------------------------------ names

export type DomainCheck = { ok: true, name: string } | { ok: false, error: string, fragment?: boolean }

/** "Alice.TON", "alice", "привет.ton" → "alice" / "xn--b1agj9af". Applies the collection's rules (4–126 of a-z 0-9 -, no edge hyphen). */
export function normalizeDomain(input: string): DomainCheck {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
  if (!s) return { ok: false, error: 'Enter a .ton domain, like alice.ton.' }
  if (s.endsWith('.t.me') || s.startsWith('@') || /^\+?888[\d\s]*$/.test(s))
    return { ok: false, fragment: true, error: 'Telegram usernames (.t.me) and +888 numbers are sold only on Fragment, not through the .ton auction.' }
  if (s.endsWith('.ton')) s = s.slice(0, -4)
  if (s.includes('.')) return { ok: false, error: 'Only name.ton domains are sold here. Subdomains are created by the parent domain\'s own resolver.' }
  if (/[^\x20-\x7e]/.test(s)) {
    try {
      s = new URL(`http://${s}.ton`).hostname.slice(0, -4) // native IDNA → xn--… punycode
    }
    catch {
      return { ok: false, error: 'This name has characters that cannot be used in a domain.' }
    }
  }
  if (s.length < 4) return { ok: false, error: '.ton names have at least 4 characters.' }
  if (s.length > 126) return { ok: false, error: '.ton names have at most 126 characters.' }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) return { ok: false, error: 'Use only a–z, 0–9 and hyphens (not at the start or end).' }
  return { ok: true, name: s }
}

/** NFT index of a name: slice_hash(domain) in nft-collection.fc. */
export function itemIndex(name: string): bigint {
  return BigInt(`0x${beginCell().storeBuffer(Buffer.from(name, 'utf8')).endCell().hash().toString('hex')}`)
}

/** calculate_nft_item_address: StateInit(code = item code from the collection, data = index + collection). */
export function itemAddress(name: string, collection: Address, itemCode: Cell): Address {
  const data = beginCell().storeUint(itemIndex(name), 256).storeAddress(collection).endCell()
  return contractAddress(0, { code: itemCode, data })
}

/** Collection storage: ^content ^nft_item_code. */
export function itemCodeFromCollection(dataBoc: string): Cell {
  const code = Cell.fromBase64(dataBoc).refs[1]
  if (!code) throw new Error('Unexpected DNS collection data')
  return code
}

// ------------------------------------------------------------------ item state

export interface DnsAuction {
  maxBidder: Address | null
  /** nanoGRAM. */
  maxBid: bigint
  endTime: number
}

export interface DnsItemState {
  initialized: boolean
  index: bigint
  collection: Address
  /** null while the item is in its first auction (zero address). */
  owner: Address | null
  /** Name without ".ton" (empty for an uninitialized item). */
  domain: string
  records: Map<bigint, Cell>
  auction: DnsAuction | null
  lastFillUpTime: number
}

const addrOrNull = (a: ReturnType<ReturnType<Cell['beginParse']>['loadAddressAny']>) => (a && Address.isAddress(a) ? a : null)

/** nft-item.fc load_data(). */
export function parseItemData(data: Cell): DnsItemState {
  const s = data.beginParse()
  const index = s.loadUintBig(256)
  const collection = s.loadAddress()
  if (s.remainingBits === 0) return { initialized: false, index, collection, owner: null, domain: '', records: new Map(), auction: null, lastFillUpTime: 0 }
  const owner = addrOrNull(s.loadAddressAny())
  const content = s.loadRef().beginParse()
  const domain = s.loadRef().beginParse()
  const name = domain.loadBuffer(Math.floor(domain.remainingBits / 8)).toString('utf8')
  const auctionCell = s.loadMaybeRef()
  const lastFillUpTime = Number(s.loadUintBig(64))

  const records = new Map<bigint, Cell>()
  if (content.loadUint(8) === 0) {
    const dict = content.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    for (const [k, v] of dict) records.set(k, v)
  }
  let auction: DnsAuction | null = null
  if (auctionCell) {
    const a = auctionCell.beginParse()
    auction = { maxBidder: addrOrNull(a.loadAddressAny()), maxBid: a.loadCoins(), endTime: Number(a.loadUintBig(64)) }
  }
  return { initialized: true, index, collection, owner, domain: name, records, auction, lastFillUpTime }
}

export type DomainStatus =
  | { kind: 'free' }
  /** Auction running: bid at least minNextBid. */
  | { kind: 'auction', auction: DnsAuction, minNextBid: bigint }
  /** Auction over, the winner has not claimed it yet (any owner action claims it). */
  | { kind: 'won', winner: Address | null, auction: DnsAuction, expiresAt: number }
  | { kind: 'owned', owner: Address | null, expiresAt: number }
  /** Not renewed for over a year: still renewable by the owner, but anyone can release it into a new auction. */
  | { kind: 'expired', owner: Address | null, expiresAt: number }

/** Mirrors recv_internal: auction_complete = now > end; release allowed when now - last_fill_up_time > one_year. */
export function domainStatus(item: DnsItemState | null, now: number): DomainStatus {
  if (!item?.initialized) return { kind: 'free' }
  const { auction } = item
  if (auction && now <= auction.endTime) return { kind: 'auction', auction, minNextBid: minNextBid(auction.maxBid) }
  const owner = auction ? auction.maxBidder : item.owner
  const expiresAt = item.lastFillUpTime + ONE_YEAR
  if (now > expiresAt) return { kind: 'expired', owner, expiresAt }
  if (auction) return { kind: 'won', winner: owner, auction, expiresAt }
  return { kind: 'owned', owner, expiresAt }
}

/** throw_unless(407, msg_value >= muldiv(max_bid_amount, 105, 100)). */
export function minNextBid(maxBid: bigint): bigint {
  return maxBid * 105n / 100n
}

const PRICE_TABLE: Record<number, [number, number]> = { 4: [1000, 100], 5: [500, 50], 6: [400, 40], 7: [300, 30], 8: [200, 20], 9: [100, 10], 10: [50, 5] }

/** get_min_price(): the starting price drops 10%/month from 2022-07-30 and settles after 21 months. Name length in bytes. */
export function minPrice(nameLength: number, now: number): bigint {
  const [start, end] = PRICE_TABLE[nameLength] ?? [10, 1]
  const months = Math.floor((now - AUCTION_START_TIME) / ONE_MONTH)
  if (months > 21) return BigInt(end) * 1_000_000_000n
  let p = BigInt(start) * 1_000_000_000n
  for (let i = 0; i < months; i++) p = p * 90n / 100n
  return p
}

/** First-auction length set by the item on deploy (shrinks from 1 week to 1 hour over the first year). */
export function firstAuctionDuration(now: number): number {
  const months = Math.min(12, Math.floor((now - AUCTION_START_TIME) / ONE_MONTH))
  return Math.floor(RELEASE_AUCTION_DURATION - (RELEASE_AUCTION_DURATION - 3600) * months / 12)
}

// ------------------------------------------------------------------ messages

/** change_dns_record#4eb1f0f9 query_id:uint64 key:uint256 value:(Maybe ^DNSRecord). No value deletes the key. */
export function changeRecordBody(key: bigint, value: Cell | null, queryId = 0n): Cell {
  const b = beginCell().storeUint(OP_CHANGE_DNS_RECORD, 32).storeUint(queryId, 64).storeUint(key, 256)
  if (value) b.storeRef(value)
  return b.endCell()
}

/** Renewal: any owner op refreshes last_fill_up_time; deleting the unused key 0 changes nothing else (what dns.ton.org sends). */
export function renewBody(queryId = 0n): Cell {
  return changeRecordBody(0n, null, queryId)
}

/** dns_balance_release#4ed14b65 query_id:uint64: puts an expired domain back into a 1-week auction with the sender as first bidder. */
export function releaseBody(queryId = 0n): Cell {
  return beginCell().storeUint(OP_DNS_BALANCE_RELEASE, 32).storeUint(queryId, 64).endCell()
}

// ------------------------------------------------------------------ record values (TEP-81 DNSRecord)

export const walletRecord = (a: Address) => beginCell().storeUint(0x9FD3, 16).storeAddress(a).storeUint(0, 8).endCell()
export const adnlRecord = (b: Uint8Array) => beginCell().storeUint(0xAD01, 16).storeBuffer(bytes32(b)).storeUint(0, 8).endCell()
export const storageRecord = (b: Uint8Array) => beginCell().storeUint(0x7473, 16).storeBuffer(bytes32(b)).endCell()
export const nextResolverRecord = (a: Address) => beginCell().storeUint(0xBA93, 16).storeAddress(a).endCell()

function bytes32(b: Uint8Array): Buffer {
  if (b.length !== 32) throw new Error('Expected 32 bytes')
  return Buffer.from(b)
}

export type ParsedRecord =
  | { type: 'wallet' | 'next_resolver', address: Address }
  | { type: 'adnl' | 'storage', hex: string }
  | { type: 'unknown', boc: string }

export function parseRecord(cell: Cell): ParsedRecord {
  try {
    const s = cell.beginParse()
    const tag = s.loadUint(16)
    if (tag === 0x9FD3) return { type: 'wallet', address: s.loadAddress() }
    if (tag === 0xBA93) return { type: 'next_resolver', address: s.loadAddress() }
    if (tag === 0xAD01) return { type: 'adnl', hex: s.loadBuffer(32).toString('hex') }
    if (tag === 0x7473) return { type: 'storage', hex: s.loadBuffer(32).toString('hex') }
  }
  catch { /* fall through */ }
  return { type: 'unknown', boc: cell.toBoc().toString('base64') }
}

/** 32 bytes from 64 hex chars or base64 (toncenter returns bag ids / ADNL in base64). */
export function parseBytes32(input: string): Uint8Array | null {
  const s = input.trim().replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex')
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) {
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (b.length === 32) return b
  }
  return null
}

// ------------------------------------------------------------------ fetching

interface AccountStateRow { address: string, status: string, balance: string, data_boc?: string | null }

async function accountState(v3: V3Fetch, address: string): Promise<AccountStateRow | null> {
  const r = await v3<{ accounts: AccountStateRow[] }>('accountStates', { address, include_boc: true })
  return r.accounts[0] ?? null
}

const codeCache = new Map<TonNetwork, Cell>()

async function itemCode(v3: V3Fetch, network: TonNetwork): Promise<Cell> {
  let c = codeCache.get(network)
  if (!c) {
    const acc = await accountState(v3, DNS_COLLECTION[network])
    if (!acc?.data_boc) throw new Error('Could not read the .ton DNS collection')
    c = itemCodeFromCollection(acc.data_boc)
    codeCache.set(network, c)
  }
  return c
}

export interface DomainLookup {
  name: string
  address: Address
  /** nanoGRAM on the item (0 when it does not exist). */
  balance: bigint
  item: DnsItemState | null
}

/** Item state of a .ton item address; null when not deployed. Throws when the address is not a .ton DNS item. */
export async function readItem(v3: V3Fetch, network: TonNetwork, address: Address): Promise<DomainLookup> {
  const acc = await accountState(v3, address.toRawString())
  if (!acc || acc.status !== 'active' || !acc.data_boc) return { name: '', address, balance: BigInt(acc?.balance ?? 0), item: null }
  let item: DnsItemState
  try {
    item = parseItemData(Cell.fromBase64(acc.data_boc))
  }
  catch {
    throw new Error('This address is not a .ton domain.')
  }
  if (!item.collection.equals(Address.parse(DNS_COLLECTION[network]))) throw new Error(`This address is not a .ton domain on ${network}.`)
  return { name: item.domain, address, balance: BigInt(acc.balance), item }
}

/** Resolves a normalized name (no ".ton") to its item address and reads its state. */
export async function lookupDomain(v3: V3Fetch, network: TonNetwork, name: string): Promise<DomainLookup> {
  const address = itemAddress(name, Address.parse(DNS_COLLECTION[network]), await itemCode(v3, network))
  const r = await readItem(v3, network, address)
  return { ...r, name }
}

/** Accepts "alice.ton", "alice" or an item address (EQ…/0:…). */
export async function lookupInput(v3: V3Fetch, network: TonNetwork, input: string): Promise<DomainLookup> {
  const s = input.trim()
  if (Address.isFriendly(s) || Address.isRaw(s)) {
    const r = await readItem(v3, network, Address.parse(s))
    // An undeployed address could be anything; only a name tells us which item it would be.
    if (!r.item) throw new Error(`No .ton domain contract at this address on ${network}. Enter the domain name instead.`)
    return r
  }
  const n = normalizeDomain(s)
  if (!n.ok) throw new Error(n.error)
  return lookupDomain(v3, network, n.name)
}

export interface OwnedDomain {
  name: string
  /** Item address, raw. */
  address: string
  expiringAt: number
}

/** The wallet's .ton domains from tonapi (its expiry is an index estimate; the item state is authoritative). */
export async function fetchOwnedDomains(get: <T>(path: string, q?: Record<string, string | number | boolean | undefined>) => Promise<T>, network: TonNetwork, owner: string): Promise<OwnedDomain[]> {
  const r = await get<{ items: { name: string, expiring_at: number, dns_item?: { address: string, collection?: { address: string } } }[] }>(`accounts/${owner}/dns/expiring`)
  const coll = Address.parse(DNS_COLLECTION[network]).toRawString()
  return r.items
    .filter(i => i.name.endsWith('.ton') && i.dns_item && (!i.dns_item.collection || i.dns_item.collection.address.toLowerCase() === coll))
    .map(i => ({ name: i.name, address: i.dns_item!.address, expiringAt: i.expiring_at }))
    .sort((a, b) => a.expiringAt - b.expiringAt)
}

/** Max messages per transaction the wallet advertises (TonConnect SendTransaction feature); 4 when unknown (v4 wallets). */
export function walletMaxMessages(features: readonly unknown[] | undefined): number {
  for (const f of features ?? []) {
    if (f && typeof f === 'object' && (f as { name?: string }).name === 'SendTransaction') {
      const n = (f as { maxMessages?: number }).maxMessages
      if (typeof n === 'number' && n > 0) return n
    }
  }
  return 4
}

/** "in 3 months", "2 days ago". */
export function relativeTime(unix: number, now = Math.floor(Date.now() / 1000)): string {
  const d = unix - now
  const abs = Math.abs(d)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60]]
  for (const [u, sec] of units) if (abs >= sec) return rtf.format(Math.trunc(d / sec), u)
  return rtf.format(d, 'second')
}

export const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
