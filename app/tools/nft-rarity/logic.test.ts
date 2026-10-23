import { describe, expect, it } from 'vitest'
import type { CollectionItem, TcNftItemsPage } from '~/lib/nfts-read/core'
import { toCollectionItem } from '~/lib/nfts-read/core'
import page from '~/lib/nfts-read/diamonds-0-149.fixture.json'
import { computeRarity, findItem, NONE, topPercent } from './logic'

// Real attributes: toncenter /api/v3/nft/items?collection_address=EQAG2BH0…Zbir (TON Diamonds), first 150
// items, 2026-10-22. Expected scores/ranks from an independent Python implementation over the same JSON:
// score = Σ over the 7 trait types of N / count(value), N = 150.
const PAGE = page as unknown as TcNftItemsPage
const items = PAGE.nft_items.map(it => toCollectionItem(it, PAGE.metadata))

describe('computeRarity on TON Diamonds', () => {
  const r = computeRarity(items)

  it('scores and ranks like the reference implementation', () => {
    expect(r.skipped).toBe(0)
    expect(r.traitTypes).toEqual(['Background', 'Color', 'Cut', 'Glow', 'Shape', 'Shine', 'Size'])
    expect(r.ranked.slice(0, 5).map(x => x.item.index)).toEqual(['69', '109', '149', '65', '29'])
    expect(r.ranked[0]!.score).toBeCloseTo(225.84733893557424, 9)
    expect(r.ranked[1]!.score).toBeCloseTo(133.57627666451197, 9)
    expect(r.ranked[4]!.score).toBeCloseTo(107.5, 9)
    expect(r.ranked.at(-1)!.item.index).toBe('74')
    expect(r.ranked.at(-1)!.score).toBeCloseTo(35.01010151606224, 9)
    expect(r.ranked.at(-1)!.rank).toBe(150)
  })

  it('finds an item by address, index or name', () => {
    const d = findItem(r, '', '0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8')!
    expect(d.item.name).toBe('Diamond #12')
    expect(d.score).toBeCloseTo(90.31420192710515, 9)
    expect(d.rank).toBe(14)
    expect(findItem(r, '#12')).toBe(d)
    expect(findItem(r, 'diamond #12')).toBe(d)
    expect(d.traits.find(t => t.trait === 'Glow')).toMatchObject({ value: 'Dual Green' })
    expect(d.traits.reduce((s, t) => s + t.score, 0)).toBeCloseTo(d.score, 9)
  })
})

describe('computeRarity rules', () => {
  const mk = (index: string, attrs: [string, string][]): CollectionItem => ({
    raw: `0:${index.padStart(64, '0')}`, index, owner: null, onSale: false, name: `#${index}`, hasMetadata: true,
    attributes: attrs.map(([trait, value]) => ({ trait, value }))
  })

  it('counts a missing trait as its own value and shares ranks on ties', () => {
    // Hand-computed over 4 items: Hat = Red ×3, Blue ×1 → 4/3 and 4. Eyes = Big ×1, (none) ×3 → 4 and 4/3.
    const r = computeRarity([mk('0', [['Hat', 'Red']]), mk('1', [['Hat', 'Red']]), mk('2', [['Hat', 'Blue']]), mk('3', [['Eyes', 'Big'], ['Hat', 'Red']])])
    const by = Object.fromEntries(r.ranked.map(x => [x.item.index, x]))
    expect(by['3']!.score).toBeCloseTo(4 / 3 + 4, 12)
    expect(by['2']!.score).toBeCloseTo(4 + 4 / 3, 12)
    expect(by['0']!.score).toBeCloseTo(4 / 3 + 4 / 3, 12)
    expect(r.ranked.map(x => [x.item.index, x.rank])).toEqual([['2', 1], ['3', 1], ['0', 3], ['1', 3]])
    expect(by['0']!.traits.find(t => t.trait === 'Eyes')).toMatchObject({ value: NONE, count: 3, frequency: 0.75 })
  })

  it('skips items without attributes', () => {
    const r = computeRarity([mk('0', [['Hat', 'Red']]), mk('1', [])])
    expect(r.skipped).toBe(1)
    expect(r.ranked).toHaveLength(1)
  })
})

describe('topPercent', () => {
  it('formats small and large percentiles', () => {
    expect(topPercent(14, 150)).toBe('9.3%')
    expect(topPercent(1, 10000)).toBe('0.01%')
  })
})
