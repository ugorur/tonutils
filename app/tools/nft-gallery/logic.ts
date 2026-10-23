import { COIN_SYMBOL } from '~/utils/currency'
import { formatAmount } from '~/utils/units'
import type { NftKind, TonapiNftItem } from '~/lib/nfts-read/core'
import { friendly, nftKind, previewUrl } from '~/lib/nfts-read/core'

export interface GalleryItem {
  raw: string
  name: string
  image?: string
  collection?: { raw: string, name: string }
  kind: NftKind
  trust: string
  spam: boolean
  /** Listed for sale: the wallet still owns it through a sale contract. */
  sale?: { units: bigint, decimals: number, symbol: string, market: string }
}

export function toGalleryItem(it: TonapiNftItem): GalleryItem {
  const m = it.metadata ?? {}
  const p = it.sale?.price
  return {
    raw: it.address,
    name: m.name || it.dns || (it.collection?.name ? `${it.collection.name} #${it.index}` : `NFT #${it.index}`),
    image: previewUrl(it.previews, '500x500', m.image),
    collection: it.collection ? { raw: it.collection.address, name: it.collection.name || 'Unnamed collection' } : undefined,
    kind: nftKind(it.collection?.address, m.image),
    trust: it.trust ?? 'none',
    spam: it.trust === 'blacklist',
    sale: it.sale && p
      ? { units: BigInt(p.value), decimals: p.decimals ?? 9, symbol: !p.currency_type || p.currency_type === 'native' ? COIN_SYMBOL : (p.token_name || 'tokens'), market: it.sale.market.name || 'marketplace' }
      : undefined
  }
}

export interface GalleryGroup {
  key: string
  name: string
  collection?: string
  trust: string
  items: GalleryItem[]
}

/** Groups by collection: verified collections first, then by size; standalone NFTs last. */
export function groupByCollection(items: GalleryItem[]): GalleryGroup[] {
  const groups = new Map<string, GalleryGroup>()
  for (const it of items) {
    const key = it.collection?.raw ?? 'none'
    let g = groups.get(key)
    if (!g) {
      g = { key, name: it.collection?.name ?? 'Standalone NFTs', collection: it.collection?.raw, trust: it.trust, items: [] }
      groups.set(key, g)
    }
    g.items.push(it)
  }
  const rank = (g: GalleryGroup) => (g.key === 'none' ? 2 : g.trust === 'whitelist' ? 0 : 1)
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.items.length - a.items.length || a.name.localeCompare(b.name))
}

export type KindFilter = NftKind | 'all'

export function filterItems(items: GalleryItem[], { kind = 'all', showSpam = false, search = '' }: { kind?: KindFilter, showSpam?: boolean, search?: string }): GalleryItem[] {
  const q = search.trim().toLowerCase()
  return items.filter(it => (showSpam || !it.spam)
    && (kind === 'all' || it.kind === kind)
    && (!q || it.name.toLowerCase().includes(q) || (it.collection?.name.toLowerCase().includes(q) ?? false)))
}

export function countKinds(items: GalleryItem[]): Record<NftKind, number> {
  const c: Record<NftKind, number> = { gift: 0, username: 0, number: 0, domain: 0, other: 0 }
  for (const it of items) if (!it.spam) c[it.kind]++
  return c
}

export function csvRows(items: GalleryItem[], testnet = false) {
  return items.map(it => ({
    name: it.name,
    collection: it.collection?.name ?? '',
    collection_address: it.collection ? friendly(it.collection.raw, { testnet }) : '',
    nft_address: friendly(it.raw, { testnet }),
    type: it.kind,
    trust: it.trust,
    listed_for_sale: it.sale ? 'yes' : 'no',
    price: it.sale ? formatAmount(it.sale.units, it.sale.decimals, { group: false }) : '',
    price_currency: it.sale?.symbol ?? ''
  }))
}

export const PAGE_SIZE = 100
