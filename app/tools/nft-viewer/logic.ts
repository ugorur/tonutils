import { COIN_SYMBOL } from '~/utils/currency'
import type { NftKind, TonapiNftItem } from '~/lib/nfts-read/core'
import { cleanAttributes, httpUrl, nftKind, previewUrl } from '~/lib/nfts-read/core'

export type { Royalty, StackEntry } from '~/lib/nfts-read/royalty'
export { fetchRoyalty, parseRoyalty, royaltyOn } from '~/lib/nfts-read/royalty'

export interface SalePrice {
  units: bigint
  decimals: number
  symbol: string
}

export function salePrice(sale: NonNullable<TonapiNftItem['sale']>): SalePrice {
  const p = sale.price
  const native = !p.currency_type || p.currency_type === 'native'
  return {
    units: BigInt(p.value),
    decimals: p.decimals ?? 9,
    // tonapi already says "Gram" for the native coin; keep the site-wide symbol for it.
    symbol: native ? COIN_SYMBOL : (p.token_name || 'tokens')
  }
}

export interface NftView {
  raw: string
  name: string
  description?: string
  image?: string
  /** Video / animation (mp4, webm) when the metadata has one. */
  media?: string
  attributes: { trait: string, value: string }[]
  collection?: { raw: string, name: string }
  /** Who really owns it: the seller when the item is listed for sale. */
  owner?: { raw: string, name?: string }
  /** Address the item contract itself points to (a sale contract when listed). */
  holder?: string
  sale?: { contract: string, market: string, marketRaw: string, price: SalePrice }
  kind: NftKind
  isSbt: boolean
  trust: string
  approvedBy: string[]
  dns?: string
}

const VIDEO_RE = /\.(mp4|webm|mov)(\?|$)/i

export function nftView(item: TonapiNftItem, interfaces: string[] = []): NftView {
  const m = item.metadata ?? {}
  const media = [m.animation_url, m.content_url].map(httpUrl).find(u => u && (VIDEO_RE.test(u) || String(m.content_type ?? '').startsWith('video/')))
  const sale = item.sale
  return {
    raw: item.address,
    name: m.name || item.dns || (item.collection?.name ? `${item.collection.name} #${item.index}` : `NFT #${item.index}`),
    description: typeof m.description === 'string' ? m.description : undefined,
    image: previewUrl(item.previews, '1500x1500', m.image) ?? httpUrl(m.image),
    media,
    attributes: cleanAttributes(m.attributes),
    collection: item.collection ? { raw: item.collection.address, name: item.collection.name || 'Unnamed collection' } : undefined,
    owner: sale?.owner ? { raw: sale.owner.address, name: sale.owner.name } : item.owner ? { raw: item.owner.address, name: item.owner.name } : undefined,
    holder: item.owner?.address,
    sale: sale ? { contract: sale.address, market: sale.market.name || 'Unknown marketplace', marketRaw: sale.market.address, price: salePrice(sale) } : undefined,
    kind: nftKind(item.collection?.address, m.image),
    isSbt: interfaces.includes('sbt'),
    trust: item.trust ?? 'none',
    approvedBy: item.approved_by ?? [],
    dns: item.dns
  }
}
