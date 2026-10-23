import type { CollectionItem } from '~/lib/nfts-read/core'

export interface Holder {
  owner: string
  count: number
  /** Of those, items listed for sale (held by a sale contract on the owner's behalf). */
  listed: number
}

export interface HolderBucket {
  label: string
  min: number
  max: number
  holders: number
  items: number
}

export interface HolderStats {
  items: number
  /** Items without an owner (not minted yet / burned). */
  ownerless: number
  unique: number
  listed: number
  holders: Holder[]
  buckets: HolderBucket[]
  /** Share of owned items held by the 10 largest holders, 0..1. */
  top10Share: number
}

const BUCKETS: [string, number, number][] = [['1 item', 1, 1], ['2–5', 2, 5], ['6–10', 6, 10], ['11–50', 11, 50], ['51+', 51, Infinity]]

/** Holder distribution by real owner (sellers keep their listed items). */
export function holderStats(items: CollectionItem[]): HolderStats {
  const map = new Map<string, Holder>()
  let ownerless = 0
  let listed = 0
  for (const it of items) {
    if (it.onSale) listed++
    if (!it.owner) {
      ownerless++
      continue
    }
    const h = map.get(it.owner) ?? { owner: it.owner, count: 0, listed: 0 }
    h.count++
    if (it.onSale) h.listed++
    map.set(it.owner, h)
  }
  const holders = [...map.values()].sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
  const owned = items.length - ownerless
  const buckets = BUCKETS.map(([label, min, max]) => {
    const inB = holders.filter(h => h.count >= min && h.count <= max)
    return { label, min, max, holders: inB.length, items: inB.reduce((s, h) => s + h.count, 0) }
  })
  return {
    items: items.length,
    ownerless,
    unique: holders.length,
    listed,
    holders,
    buckets,
    top10Share: owned ? holders.slice(0, 10).reduce((s, h) => s + h.count, 0) / owned : 0
  }
}

/** tonapi reports -1 as next_item_index for collections whose items are not numbered 0..n-1. */
export function itemCountLabel(nextItemIndex: number): string {
  return nextItemIndex < 0 ? 'Not sequential (items have hash-based indexes)' : nextItemIndex.toLocaleString('en-US')
}

export function percent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}
