import type { CollectionItem } from '~/lib/nfts-read/core'

/** Value used for a trait type an item does not have (rarity.tools counts "missing" as a value). */
export const NONE = '(none)'

export interface TraitScore {
  trait: string
  value: string
  /** Items in the set with this value. */
  count: number
  /** count / total, 0..1. */
  frequency: number
  /** total / count: this trait's share of the score. */
  score: number
}

export interface RankedItem {
  item: CollectionItem
  score: number
  /** 1 = rarest. Equal scores share a rank (1, 2, 2, 4). */
  rank: number
  traits: TraitScore[]
}

export interface RarityResult {
  /** Items with metadata, ranked rarest first. */
  ranked: RankedItem[]
  /** Items left out because their metadata has no attributes. */
  skipped: number
  traitTypes: string[]
  /** trait type → value → count */
  counts: Map<string, Map<string, number>>
}

/** First value per trait type (duplicates are ignored). */
function traitMap(item: CollectionItem): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of item.attributes) if (!m.has(a.trait)) m.set(a.trait, a.value)
  return m
}

/**
 * Statistical rarity (rarity.tools "rarity score"): for each trait type, add total / (items sharing
 * the item's value). A trait type an item lacks counts as the value "(none)".
 */
export function computeRarity(items: CollectionItem[]): RarityResult {
  const withTraits = items.filter(i => i.attributes.length)
  const maps = withTraits.map(traitMap)
  const traitTypes = [...new Set(maps.flatMap(m => [...m.keys()]))].sort()
  const counts = new Map<string, Map<string, number>>(traitTypes.map(t => [t, new Map()]))
  for (const m of maps) {
    for (const t of traitTypes) {
      const v = m.get(t) ?? NONE
      const c = counts.get(t)!
      c.set(v, (c.get(v) ?? 0) + 1)
    }
  }
  const n = withTraits.length
  const scored = withTraits.map((item, i) => {
    const traits = traitTypes.map((t) => {
      const value = maps[i]!.get(t) ?? NONE
      const count = counts.get(t)!.get(value)!
      return { trait: t, value, count, frequency: count / n, score: n / count }
    })
    return { item, score: traits.reduce((s, x) => s + x.score, 0), rank: 0, traits }
  })
  scored.sort((a, b) => b.score - a.score || Number(a.item.index) - Number(b.item.index))
  scored.forEach((r, i) => {
    const prev = scored[i - 1]
    r.rank = prev && Math.abs(prev.score - r.score) < 1e-9 ? prev.rank : i + 1
  })
  return { ranked: scored, skipped: items.length - n, traitTypes, counts }
}

/** Finds an item by address (raw), index or exact/partial name. */
export function findItem(result: RarityResult, query: string, raw?: string | null): RankedItem | undefined {
  if (raw) return result.ranked.find(r => r.item.raw === raw)
  const q = query.trim().toLowerCase().replace(/^#/, '')
  if (!q) return undefined
  return result.ranked.find(r => r.item.name?.toLowerCase() === q || r.item.name?.toLowerCase().endsWith(`#${q}`))
    ?? result.ranked.find(r => r.item.index === q)
    ?? result.ranked.find(r => r.item.name?.toLowerCase().includes(q))
}

/** "Top 1.4%" style percentile for a rank. */
export function topPercent(rank: number, total: number): string {
  const p = (rank / total) * 100
  return p < 1 ? `${p.toFixed(2)}%` : `${p.toFixed(1)}%`
}

export function csvRows(result: RarityResult, friendlyOf: (raw: string) => string) {
  return result.ranked.map(r => ({
    rank: r.rank,
    score: r.score.toFixed(4),
    name: r.item.name ?? '',
    index: r.item.index,
    address: friendlyOf(r.item.raw),
    ...Object.fromEntries(r.traits.map(t => [t.trait, t.value]))
  }))
}
