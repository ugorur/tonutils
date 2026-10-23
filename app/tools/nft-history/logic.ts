import { COIN_SYMBOL } from '~/utils/currency'
import { formatAmount } from '~/utils/units'
import { rateLimitedJson } from '~/utils/api-client'
import type { TcAddressBook, TcMetadata } from '~/lib/nfts-read/core'
import { tcImage, tokenInfo } from '~/lib/nfts-read/core'

// NFT action types of the toncenter v3 indexer ("nft.v3" + "dns.v2" shortcuts in
// toncenter/ton-indexer ton-index-go/index/models/action_versioning.go). toncenter does not expand the
// shortcuts in ?action_type=, so they are listed one by one.
export const NFT_ACTION_TYPES = [
  'nft_mint', 'nft_transfer', 'nft_discovery', 'auction_bid', 'nft_put_on_sale', 'nft_put_on_auction', 'auction_outbid',
  'nft_cancel_sale', 'nft_purchase', 'nft_cancel_auction', 'nft_finish_auction', 'teleitem_start_auction',
  'teleitem_cancel_auction', 'nft_update_sale', 'dns_purchase', 'dns_release'
] as const

/** Path for useToncenter().v3: repeated action_type params (buildUrl can only set one value per key). */
export const ACTIONS_PATH = `actions?${NFT_ACTION_TYPES.map(t => `action_type=${t}`).join('&')}`

export interface TcAction {
  trace_id: string
  action_id: string
  start_utime: number
  transactions: string[]
  success: boolean
  type: string
  details: Record<string, string | boolean | null | undefined>
  trace_external_hash?: string
}

export interface TcActionsPage {
  actions: TcAction[]
  address_book: TcAddressBook
  metadata?: TcMetadata
}

const LABELS: Record<string, string> = {
  nft_mint: 'Minted',
  nft_transfer: 'Transferred',
  nft_discovery: 'Discovered',
  nft_purchase: 'Sold',
  nft_put_on_sale: 'Listed for sale',
  nft_update_sale: 'Listing changed',
  nft_cancel_sale: 'Listing cancelled',
  nft_put_on_auction: 'Put on auction',
  auction_bid: 'Bid',
  auction_outbid: 'Outbid',
  nft_finish_auction: 'Auction ended',
  nft_cancel_auction: 'Auction cancelled',
  teleitem_start_auction: 'Fragment auction started',
  teleitem_cancel_auction: 'Fragment auction cancelled',
  dns_purchase: 'Domain bought',
  dns_release: 'Domain released'
}

export interface HistoryRow {
  id: string
  time: number
  type: string
  label: string
  success: boolean
  item?: string
  itemName?: string
  itemImage?: string
  collection?: string
  from?: string
  to?: string
  /** nanoGRAM. */
  price?: bigint
  priceLabel?: string
  marketplace?: string
  /** First transaction of the action (base64). */
  tx: string
  /** Wallet view only: did the NFT (or bid) come in or go out. */
  direction?: 'in' | 'out'
  /** tonapi flags the NFT as spam/scam (set after fetchTrust). */
  spam?: boolean
}

const lower = (v: unknown) => (typeof v === 'string' && v ? v.toLowerCase() : undefined)

function pick(d: TcAction['details'], ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = lower(d[k])
    if (v) return v
  }
  return undefined
}

/** One timeline row. `me` (raw) turns on wallet perspective: Sold/Bought, In/Out. */
export function toRow(a: TcAction, metadata?: TcMetadata, me?: string): HistoryRow {
  const d = a.details
  const item = pick(d, 'nft_item')
  const info = tokenInfo(metadata, item, 'nft_items')
  let from: string | undefined
  let to: string | undefined
  let priceKey: string | undefined
  let priceLabel: string | undefined
  switch (a.type) {
    case 'nft_mint': to = pick(d, 'owner'); break
    case 'nft_transfer':
    case 'nft_purchase':
      from = pick(d, 'real_old_owner', 'old_owner')
      to = pick(d, 'new_owner')
      if (a.type === 'nft_purchase') priceKey = 'price'
      break
    case 'nft_put_on_sale':
    case 'nft_update_sale':
      from = pick(d, 'owner'); to = pick(d, 'sale_address', 'listing_address'); priceKey = 'full_price'; priceLabel = 'Asking price'; break
    case 'nft_cancel_sale': case 'nft_finish_auction': case 'nft_cancel_auction': case 'teleitem_cancel_auction': case 'dns_release':
      from = pick(d, 'owner'); break
    case 'nft_put_on_auction': case 'teleitem_start_auction':
      from = pick(d, 'owner'); to = pick(d, 'auction_address'); priceKey = 'min_bid'; priceLabel = 'Minimum bid'; break
    case 'auction_bid': from = pick(d, 'bidder'); to = pick(d, 'auction', 'auction_address'); priceKey = 'amount'; break
    case 'auction_outbid': from = pick(d, 'new_bidder'); to = pick(d, 'bidder'); priceKey = 'amount'; priceLabel = 'Bid refunded'; break
    case 'dns_purchase': to = pick(d, 'new_owner'); priceKey = 'price'; break
  }
  const rawPrice = priceKey ? d[priceKey] : undefined
  const price = typeof rawPrice === 'string' && /^\d+$/.test(rawPrice) ? BigInt(rawPrice) : undefined
  let label = LABELS[a.type] ?? a.type.replace(/_/g, ' ')
  let direction: HistoryRow['direction']
  if (me) {
    if (to === me && from === me) direction = undefined
    else if (to === me) direction = 'in'
    else if (from === me) direction = 'out'
    if (a.type === 'nft_purchase') label = direction === 'in' ? 'Bought' : direction === 'out' ? 'Sold' : 'Sold'
    if (a.type === 'nft_transfer') label = direction === 'in' ? 'Received' : direction === 'out' ? 'Sent' : from === me ? 'Sent to itself' : label
    if (a.type === 'auction_outbid' && direction === 'in') label = 'Outbid (refunded)'
  }
  return {
    id: a.action_id,
    time: a.start_utime,
    type: a.type,
    label,
    success: a.success,
    item,
    itemName: info?.name,
    itemImage: tcImage(info, 'small'),
    collection: pick(d, 'nft_collection'),
    from,
    to,
    price,
    priceLabel: price !== undefined ? (priceLabel ?? 'Price') : undefined,
    marketplace: pick(d, 'marketplace_address'),
    tx: a.transactions[0] ?? a.trace_id,
    direction
  }
}

/**
 * tonapi trust per NFT (POST /v2/nfts/_bulk, up to 100 per call). toncenter has no spam flag, and
 * wallets receive lots of scam NFTs ("you won 100 TON on …"), so the UI hides blacklisted ones.
 */
export async function fetchTrust(tonapiBase: string, raws: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(raws)]
  for (let i = 0; i < ids.length; i += 100) {
    const res = await rateLimitedJson<{ nft_items: { address: string, trust?: string }[] }>(`${tonapiBase}/nfts/_bulk`, { provider: 'tonapi' }, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account_ids: ids.slice(i, i + 100) })
    })
    for (const it of res.nft_items) out.set(it.address.toLowerCase(), it.trust ?? 'none')
  }
  return out
}

export function csvRows(rows: HistoryRow[], name: (raw?: string) => string) {
  return rows.map(r => ({
    time_utc: new Date(r.time * 1000).toISOString(),
    event: r.label,
    nft: r.itemName ?? '',
    nft_address: name(r.item),
    from: name(r.from),
    to: name(r.to),
    [`amount_${COIN_SYMBOL}`]: r.price !== undefined ? formatAmount(r.price, 9, { group: false }) : '',
    amount_type: r.priceLabel ?? '',
    success: r.success ? 'yes' : 'no',
    tx_hash_base64: r.tx
  }))
}

export const HISTORY_PAGE = 100
