import { Address } from '@ton/core'
import { fragmentNumberUrl, fragmentUsernameUrl, GIFT_ITEM_CODE_HASHES, NUMBERS_COLLECTION, sameRaw, USERNAMES_COLLECTION } from '~/lib/telegram/fragment'

/** The parts of a tonapi /v2/accounts/{id}/nfts item we use. */
export interface TonapiNft {
  address: string
  owner?: { address: string }
  collection?: { address: string, name?: string }
  metadata?: { name?: string, image?: string, attributes?: { trait_type?: string, value?: unknown }[] }
  previews?: { resolution: string, url: string }[]
  sale?: { market?: { name?: string }, price: { currency_type?: string, value: string, decimals?: number, token_name?: string } }
  trust?: string
  code_hash?: string
}

export type Kind = 'username' | 'number' | 'gift' | 'scam' | 'other'

export function classify(n: TonapiNft): Kind {
  if (n.trust === 'blacklist') return 'scam'
  if (sameRaw(n.collection?.address, USERNAMES_COLLECTION)) return 'username'
  if (sameRaw(n.collection?.address, NUMBERS_COLLECTION)) return 'number'
  // Gift contract code is public; tonapi's whitelist rules out copies deployed by others.
  if (n.code_hash && GIFT_ITEM_CODE_HASHES.has(n.code_hash) && n.trust === 'whitelist') return 'gift'
  return 'other'
}

export interface Collectible {
  kind: Kind
  address: string
  name: string
  collection: string
  image?: string
  /** Fragment page for this item. */
  url?: string
  /** Gift traits (Model, Backdrop, Symbol). */
  traits: { name: string, value: string }[]
  sale?: { market: string, nano: bigint, decimals: number, symbol: string | null /* null = native coin */ }
}

/** "https://nft.fragment.com/gift/plushpepe-1043.webp" → "plushpepe-1043". */
export const giftSlug = (image?: string) => image?.match(/^https:\/\/nft\.fragment\.com\/gift\/([a-z0-9-]+)\./i)?.[1]

export function toCollectible(n: TonapiNft): Collectible {
  const kind = classify(n)
  const name = n.metadata?.name ?? 'Unnamed NFT'
  let url: string | undefined
  if (kind === 'username') url = fragmentUsernameUrl(name.replace(/^@/, ''))
  else if (kind === 'number') url = fragmentNumberUrl(name.replace(/\D/g, ''))
  else if (kind === 'gift') {
    const slug = giftSlug(n.metadata?.image)
    if (slug) url = `https://fragment.com/gift/${slug}`
  }
  const p = n.sale?.price
  return {
    kind,
    address: n.address,
    name,
    collection: n.collection?.name ?? '',
    image: n.previews?.find(x => x.resolution === '100x100')?.url,
    url,
    traits: kind === 'gift' ? (n.metadata?.attributes ?? []).filter(a => a.trait_type && a.value != null).map(a => ({ name: a.trait_type!, value: String(a.value) })) : [],
    sale: p ? { market: n.sale?.market?.name ?? 'Marketplace', nano: BigInt(p.value), decimals: p.decimals ?? 9, symbol: p.currency_type === 'native' ? null : (p.token_name ?? '?') } : undefined
  }
}

export interface Summary {
  usernames: Collectible[]
  numbers: Collectible[]
  /** Gifts grouped by collection name, largest group first. */
  gifts: { collection: string, items: Collectible[] }[]
  giftCount: number
  scams: Collectible[]
  otherCount: number
  listed: number
  /** Sum of listing prices in the native coin (jetton-priced listings are not added). */
  listedNativeNano: bigint
}

export function summarize(nfts: TonapiNft[]): Summary {
  const all = nfts.map(toCollectible)
  const by = (k: Kind) => all.filter(c => c.kind === k).sort((a, b) => a.name.localeCompare(b.name))
  const groups = new Map<string, Collectible[]>()
  for (const g of by('gift')) groups.set(g.collection, [...(groups.get(g.collection) ?? []), g])
  const telegram = all.filter(c => c.kind === 'username' || c.kind === 'number' || c.kind === 'gift')
  return {
    usernames: by('username'),
    numbers: by('number'),
    gifts: [...groups].map(([collection, items]) => ({ collection, items })).sort((a, b) => b.items.length - a.items.length || a.collection.localeCompare(b.collection)),
    giftCount: by('gift').length,
    scams: by('scam'),
    otherCount: by('other').length,
    listed: telegram.filter(c => c.sale).length,
    listedNativeNano: telegram.reduce((s, c) => s + (c.sale && c.sale.symbol === null ? c.sale.nano : 0n), 0n)
  }
}

export const KIND_LABEL: Record<Kind, string> = { username: 'Username', number: 'Number', gift: 'Gift', scam: 'Scam', other: 'Other' }

/** Wallet address (any form) or a .ton domain → the account id tonapi accepts. Throws a readable Error. */
export function parseOwner(input: string): string {
  const s = input.trim()
  if (/^([a-z0-9-]+\.)+ton$/i.test(s)) return s.toLowerCase()
  try {
    return Address.parse(s).toRawString()
  }
  catch {
    throw new Error('Enter a TON wallet address (UQ…, EQ…, 0:…) or a .ton domain.')
  }
}
