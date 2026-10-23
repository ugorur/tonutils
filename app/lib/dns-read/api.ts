// Network calls shared by the dns-read tools. Everything goes through the shared rate-limited clients.
import type { Cell } from '@ton/core'
import { useToncenter } from '~/composables/useToncenter'
import type { DnsItemData, Net } from './core'
import { DNS_COLLECTION, itemCodeFromCollectionData, parseItemData } from './core'

type V3 = ReturnType<typeof useToncenter>['v3']

interface TcAccountState {
  address: string
  status: string
  data_boc?: string | null
}

/** toncenter v3 address_book entry: `domain` is the name explorers and wallets show for the address. */
export interface TcAddressBook {
  [raw: string]: { user_friendly: string, domain: string | null }
}

export interface TcDnsRecord {
  nft_item_address: string
  nft_item_owner: string | null
  domain: string
  dns_wallet: string | null
  dns_site_adnl: string | null
  dns_storage_bag_id: string | null
  dns_next_resolver: string | null
}

export interface TcNftItem {
  address: string
  index: string
  owner_address: string | null
  real_owner?: string | null
  on_sale?: boolean
  content?: { domain?: string } | null
}

const codeCache = new Map<Net, Promise<Cell>>()

/** The collection's nft_item_code (one toncenter call per network and page load). */
export function loadItemCode(network: Net, v3: V3): Promise<Cell> {
  let p = codeCache.get(network)
  if (!p) {
    p = v3<{ accounts: TcAccountState[] }>('accountStates', { address: DNS_COLLECTION[network], include_boc: true }).then((r) => {
      const boc = r.accounts[0]?.data_boc
      if (!boc) throw new Error('Could not read the .ton DNS collection from toncenter.')
      return itemCodeFromCollectionData(boc)
    })
    p.catch(() => codeCache.delete(network))
    codeCache.set(network, p)
  }
  return p
}

/** toncenter accepts ~100 addresses per accountStates call (query string length). */
export const BATCH = 100

/**
 * On-chain data of DNS items, keyed by lowercase raw address. A missing account (never minted) maps to null.
 * Throws if an existing item cannot be parsed, so a bad read is never shown as "available".
 */
export async function fetchItems(raws: string[], v3: V3, onProgress?: (done: number) => void): Promise<Map<string, DnsItemData | null>> {
  const out = new Map<string, DnsItemData | null>()
  for (let i = 0; i < raws.length; i += BATCH) {
    const batch = raws.slice(i, i + BATCH)
    const qs = batch.map(a => `address=${encodeURIComponent(a)}`).join('&')
    const r = await v3<{ accounts: TcAccountState[] }>(`accountStates?${qs}&include_boc=true`)
    for (const a of batch) out.set(a, null)
    for (const acc of r.accounts) {
      const raw = acc.address.toLowerCase()
      if (acc.status !== 'active') continue // uninit (only stray coins) or nonexist: not minted
      if (!acc.data_boc) throw new Error(`toncenter returned no data for DNS item ${raw}.`)
      out.set(raw, parseItemData(acc.data_boc))
    }
    onProgress?.(Math.min(i + BATCH, raws.length))
  }
  return out
}

/** Every NFT of `collection` owned by `owner` (paged, 1000 per call). */
export async function fetchOwnedItems(owner: string, collection: string, v3: V3, max = 5000): Promise<{ items: TcNftItem[], book: TcAddressBook }> {
  const items: TcNftItem[] = []
  let book: TcAddressBook = {}
  for (let offset = 0; offset < max; offset += 1000) {
    const r = await v3<{ nft_items: TcNftItem[], address_book: TcAddressBook }>('nft/items', { owner_address: owner, collection_address: collection, limit: 1000, offset })
    items.push(...r.nft_items)
    book = { ...book, ...r.address_book }
    if (r.nft_items.length < 1000) break
  }
  return { items, book }
}
