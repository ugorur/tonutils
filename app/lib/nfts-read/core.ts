// Shared, pure helpers for the "nfts-read" tools (viewer, gallery, collection, history, rarity).
// Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { DEAD_GATEWAY, ipfsToHttp } from '~/utils/ipfs'
import { Address } from '@ton/core'

/** Lowercase raw "0:abc…". Throws on invalid input. */
export function toRaw(address: string): string {
  return Address.parse(address.trim()).toRawString().toLowerCase()
}

/** Friendly form. NFT items and collections are contracts, so bounceable by default. */
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

const NAME_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(ton|t\.me)$/i

export type NftQuery =
  | { kind: 'empty' }
  | { kind: 'address', raw: string }
  | { kind: 'domain', name: string }
  | { kind: 'invalid', error: string }

/**
 * An address in any form, or a link that contains one (getgems, tonviewer, tonscan …).
 * In a link the last address wins: getgems.io/collection/<collection>/<item> means the item.
 * `allowNames` also accepts .ton / .t.me names (wallet inputs).
 */
export function parseNftQuery(input: string, { allowNames = false } = {}): NftQuery {
  const q = input.trim()
  if (!q) return { kind: 'empty' }
  if (allowNames && NAME_RE.test(q)) return { kind: 'domain', name: q.toLowerCase() }
  // Whole input first (base64 addresses may contain "/"), then URL segments from the end.
  for (const token of [q, ...q.split(/[\s/?#&=,]+/).reverse()]) {
    try {
      return { kind: 'address', raw: toRaw(token) }
    }
    catch { /* try the next one */ }
  }
  return { kind: 'invalid', error: allowNames ? 'Not a valid TON address, link or .ton / .t.me name.' : 'Not a valid TON address or NFT link. Check for a typo.' }
}

/**
 * tonapi answers an unknown .ton / .t.me name with HTTP 400 "entity not found" (checked 2026-10-23);
 * turn that into a readable error, pass everything else through.
 */
export function nameError(e: unknown, name: string, network: string): unknown {
  const status = (e as { status?: unknown } | null)?.status
  return (e as Error | null)?.name === 'TonApiError' && (status === 400 || status === 404)
    ? new Error(`${name} is not linked to any wallet on ${network}. Check the spelling, or paste the wallet address instead.`)
    : e
}

// ---- tonapi shapes ----

export interface TonapiAccountRef {
  address: string
  name?: string
  is_scam?: boolean
  is_wallet?: boolean
}

export interface TonapiPreview {
  resolution: string
  url: string
}

export interface NftAttribute {
  trait_type?: string
  value?: unknown
}

export type Trust = 'whitelist' | 'graylist' | 'blacklist' | 'none' | string

export interface TonapiNftItem {
  address: string
  index: number
  owner?: TonapiAccountRef
  collection?: { address: string, name?: string, description?: string }
  verified: boolean
  metadata: Record<string, unknown> & { name?: string, description?: string, image?: string, attributes?: NftAttribute[] }
  sale?: {
    address: string
    market: TonapiAccountRef
    owner?: TonapiAccountRef
    price: { currency_type?: string, value: string, decimals?: number, token_name?: string, jetton?: string }
  }
  previews?: TonapiPreview[]
  dns?: string
  approved_by: string[]
  trust?: Trust
  include_cnft?: boolean
}

export interface TonapiCollection {
  address: string
  next_item_index: number
  owner?: TonapiAccountRef
  raw_collection_content?: string
  metadata?: Record<string, unknown> & { name?: string, description?: string, image?: string, cover_image?: string, external_link?: string, external_url?: string, social_links?: string[] }
  previews?: TonapiPreview[]
  approved_by: string[]
  trust?: Trust
}

/** Picks the preview closest to `size` (e.g. '500x500'); falls back to the original image. */
export function previewUrl(previews: TonapiPreview[] | undefined, size: '100x100' | '500x500' | '1500x1500' = '500x500', fallback?: string): string | undefined {
  return previews?.find(p => p.resolution === size)?.url ?? httpUrl(fallback)
}

/** ipfs:// and dead gateway links → the shared gateway (~/utils/ipfs); anything else that is not http(s) is dropped. */
export function httpUrl(url?: unknown): string | undefined {
  if (typeof url !== 'string' || !url) return undefined
  const u = /^ar:\/\//i.test(url) ? url : ipfsToHttp(url)
  return /^https?:\/\//.test(u) ? u : undefined
}

/** Attributes as clean { trait, value } strings, skipping broken entries. */
export function cleanAttributes(attrs: unknown): { trait: string, value: string }[] {
  if (!Array.isArray(attrs)) return []
  return attrs.flatMap((a: NftAttribute) => {
    if (!a || typeof a !== 'object' || a.trait_type === undefined || a.value === undefined || a.value === null) return []
    const value = typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value)
    return [{ trait: String(a.trait_type), value }]
  })
}

export const TRUST_INFO: Record<string, { label: string, color: 'success' | 'neutral' | 'warning' | 'error', hint: string }> = {
  whitelist: { label: 'Verified', color: 'success', hint: 'tonapi lists this collection as verified.' },
  graylist: { label: 'Unverified', color: 'warning', hint: 'tonapi has doubts about this item. Check the collection before you trust it.' },
  blacklist: { label: 'Spam / scam', color: 'error', hint: 'tonapi flags this as spam or a scam. Do not visit links in it or "claim" anything.' },
  none: { label: 'Not reviewed', color: 'neutral', hint: 'Not reviewed by tonapi. Anyone can create a collection with any name or image.' }
}

export function trustInfo(trust?: Trust) {
  return TRUST_INFO[trust ?? 'none'] ?? TRUST_INFO.none!
}

// ---- Telegram & TON DNS collections ----

// Collection addresses (tonapi/toncenter, 2026-10-22): Telegram Usernames EQCA14o1…zwnPi,
// Anonymous Telegram Numbers EQAOQdwd…si5N, TON DNS (.ton) EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz.
export const TELEGRAM_USERNAMES = '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2'
export const TELEGRAM_NUMBERS = '0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2'
export const TON_DNS = '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf'

export type NftKind = 'gift' | 'username' | 'number' | 'domain' | 'other'

export const NFT_KIND_LABELS: Record<NftKind, string> = {
  gift: 'Telegram gifts',
  username: 'Telegram usernames',
  number: 'Anonymous numbers',
  domain: '.ton domains',
  other: 'Other NFTs'
}

/** Telegram collectible gifts carry Fragment-hosted images (nft.fragment.com/gift/…). */
export function nftKind(collection: string | undefined, image: unknown): NftKind {
  const c = collection?.toLowerCase()
  if (c === TELEGRAM_USERNAMES) return 'username'
  if (c === TELEGRAM_NUMBERS) return 'number'
  if (c === TON_DNS) return 'domain'
  if (typeof image === 'string' && image.startsWith('https://nft.fragment.com/gift/')) return 'gift'
  return 'other'
}

// ---- toncenter v3 shapes ----

export interface TcTokenInfo {
  valid?: boolean
  type: string
  name?: string
  description?: string
  image?: string
  nft_index?: string
  is_scam?: boolean
  extra?: Record<string, unknown> & { _image_small?: string, _image_medium?: string, _image_big?: string, attributes?: NftAttribute[] }
}

/**
 * toncenter's resized image proxy, or the original when the proxy cannot serve it. The proxy URL ends
 * with the base64url source; every one we probed whose source is `local:///sha256/…` returned 404
 * (TON Diamonds, Playmuse, most spam), while `local:///ab/cd/…` ones returned 200 (2026-10-23).
 */
export function tcImage(info: TcTokenInfo | undefined, size: 'small' | 'medium' | 'big'): string | undefined {
  const original = httpUrl(info?.image)
  const proxy = httpUrl(info?.extra?.[`_image_${size}`])
  if (!proxy) return original
  const src = proxy.slice(proxy.lastIndexOf('/') + 1)
  try {
    // The proxy also fails (passes the 429 through) when the source sits on a dead IPFS gateway.
    const source = atob(src.replace(/-/g, '+').replace(/_/g, '/'))
    if (source.startsWith('local:///sha256/') || DEAD_GATEWAY.test(source)) return original ?? proxy
  }
  catch { /* not base64: a direct URL */ }
  return proxy
}

export type TcMetadata = Record<string, { is_indexed: boolean, token_info?: TcTokenInfo[] }>
export type TcAddressBook = Record<string, { user_friendly: string, domain: string | null, interfaces?: string[] }>

export interface TcNftItem {
  address: string
  init: boolean
  index: string
  collection_address: string | null
  owner_address: string | null
  real_owner?: string | null
  on_sale?: boolean
  sale_contract_address?: string | null
  content?: Record<string, unknown>
  last_transaction_lt?: string
}

export interface TcNftItemsPage {
  nft_items: TcNftItem[]
  address_book: TcAddressBook
  metadata?: TcMetadata
}

/** toncenter keys maps by uppercase raw address. */
export function tcKey(raw: string): string {
  return raw.toUpperCase()
}

export function tokenInfo(metadata: TcMetadata | undefined, raw: string | null | undefined, type?: string): TcTokenInfo | undefined {
  if (!raw || !metadata) return undefined
  const infos = metadata[tcKey(raw)]?.token_info ?? []
  return infos.find(t => !type || t.type === type)
}

/** One collection item, flattened for the collection, holder and rarity views. */
export interface CollectionItem {
  raw: string
  index: string
  /** Real owner: the seller when the item sits in a sale contract. */
  owner: string | null
  onSale: boolean
  name?: string
  image?: string
  attributes: { trait: string, value: string }[]
  /** false when toncenter has not indexed the off-chain metadata (no name/attributes). */
  hasMetadata: boolean
}

export function toCollectionItem(item: TcNftItem, metadata?: TcMetadata): CollectionItem {
  const info = tokenInfo(metadata, item.address, 'nft_items')
  const owner = item.real_owner ?? item.owner_address
  return {
    raw: item.address.toLowerCase(),
    index: item.index,
    owner: owner ? owner.toLowerCase() : null,
    onSale: !!item.on_sale,
    name: info?.name,
    image: tcImage(info, 'medium'),
    attributes: cleanAttributes(info?.extra?.attributes),
    hasMetadata: !!info && info.valid !== false
  }
}

export type V3Get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

export const COLLECTION_PAGE = 1000

/**
 * Pages every item of a collection from toncenter v3 (1000 per request, ~1 req/s), up to `max`.
 * Items come back in index order; duplicates (from mints between pages) are dropped.
 */
export async function fetchCollectionItems(
  v3: V3Get,
  collection: string,
  { max = 20000, pageSize = COLLECTION_PAGE, onProgress, cancelled, sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)) }: { max?: number, pageSize?: number, onProgress?: (loaded: number) => void, cancelled?: () => boolean, sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ items: CollectionItem[], complete: boolean }> {
  const seen = new Map<string, CollectionItem>()
  for (let offset = 0; offset < max; offset += pageSize) {
    const limit = Math.min(pageSize, max - offset)
    const page = await pageWithPatience(() => v3<TcNftItemsPage>('nft/items', { collection_address: collection, limit, offset }), sleep)
    if (cancelled?.()) return { items: [...seen.values()], complete: false }
    for (const it of page.nft_items) seen.set(it.address.toLowerCase(), toCollectionItem(it, page.metadata))
    onProgress?.(seen.size)
    if (page.nft_items.length < limit) return { items: [...seen.values()], complete: true }
  }
  return { items: [...seen.values()], complete: false }
}

/**
 * A long scan makes 10–20 requests in a row; one rate-limited page (after the client's own retries)
 * should not throw away the pages already read. Waits 5, 10, 15 s and tries the page again.
 */
async function pageWithPatience<T>(load: () => Promise<T>, sleep: (ms: number) => Promise<void>, extra = 3): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await load()
    }
    catch (e) {
      if (n >= extra || !(e as { isRateLimit?: boolean } | null)?.isRateLimit) throw e
      await sleep(5000 * (n + 1))
    }
  }
}

// Per-session cache so the collection explorer and the rarity tool do not page the same collection twice.
const cache = new Map<string, Promise<{ items: CollectionItem[], complete: boolean }>>()

export function cachedCollectionItems(network: string, collection: string, max: number, v3: V3Get, opts: { onProgress?: (n: number) => void, cancelled?: () => boolean } = {}) {
  const key = `${network}:${collection}:${max}`
  let p = cache.get(key)
  if (!p) {
    p = fetchCollectionItems(v3, collection, { max, ...opts })
    p.then(r => !r.complete && r.items.length < max && cache.delete(key), () => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** Short 0:abcd…wxyz for places where a full address does not fit. */
export function shortRaw(raw: string): string {
  return raw.length > 14 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw
}

export function formatUtc(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}
