import { describe, expect, it } from 'vitest'
import type { TonapiNftItem } from '~/lib/nfts-read/core'
import fixture from './fixture.json'
import { countKinds, csvRows, filterItems, groupByCollection, toGalleryItem } from './logic'

// tonapi GET /v2/accounts/0:1a1c93fc…9fca/nfts?limit=100&indirect_ownership=true (2026-10-22, 32 items,
// fields trimmed) plus tonapi GET /v2/nfts/0:455642ac…ebfe (Telegram gift "Vintage Cigar #17336").
const items = (fixture as unknown as TonapiNftItem[]).map(toGalleryItem)

describe('nft gallery', () => {
  it('hides tonapi-blacklisted spam by default', () => {
    expect(items).toHaveLength(33)
    expect(items.filter(i => i.spam)).toHaveLength(21)
    expect(filterItems(items, {})).toHaveLength(12)
    expect(filterItems(items, { showSpam: true })).toHaveLength(33)
    // A fake "+888" number outside the real Anonymous Numbers collection stays spam, not a number.
    const fake = items.find(i => i.name === '+888 0000 8808')!
    expect(fake).toMatchObject({ spam: true, kind: 'other', collection: undefined })
  })

  it('keeps items listed for sale with their price (indirect ownership)', () => {
    const listed = items.filter(i => i.sale)
    expect(listed.map(i => [i.name, i.sale!.units, i.sale!.symbol, i.sale!.market])).toEqual([
      ['Diamond #1257', 139000000000n, 'GRAM', 'Getgems Sales'],
      ['Diamond #247', 999000000000n, 'GRAM', 'Getgems Sales'],
      ['Diamond #12', 1275000000000n, 'GRAM', 'Getgems Sales']
    ])
  })

  it('recognizes Telegram gifts and filters by kind', () => {
    const gift = items.at(-1)!
    expect(gift).toMatchObject({ name: 'Vintage Cigar #17336', kind: 'gift', spam: false })
    expect(countKinds(items)).toEqual({ gift: 1, username: 0, number: 0, domain: 0, other: 11 })
    expect(filterItems(items, { kind: 'gift' }).map(i => i.name)).toEqual(['Vintage Cigar #17336'])
    expect(filterItems(items, { search: 'diamond' })).toHaveLength(3)
  })

  it('groups by collection, verified collections first', () => {
    const groups = groupByCollection(filterItems(items, {}))
    expect(groups.map(g => [g.name, g.items.length])).toEqual([
      ['TON Diamonds', 3],
      ['StickerFace Wearables', 1],
      ['Vintage Cigars', 1],
      ['Playmuse Holders Club', 4],
      ['Amazing Marshmallows X DC TON', 1],
      ['Hack-a-TONx: DeFi & Data Analytics Participants', 1],
      ['同款广告@xiatie', 1]
    ])
  })

  it('exports CSV rows with friendly addresses', () => {
    const row = csvRows(items.filter(i => i.name === 'Diamond #12'))[0]!
    expect(row).toEqual({
      name: 'Diamond #12',
      collection: 'TON Diamonds',
      collection_address: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir',
      nft_address: 'EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH',
      type: 'other',
      trust: 'whitelist',
      listed_for_sale: 'yes',
      price: '1275',
      price_currency: 'GRAM'
    })
  })
})

describe('nameError', () => {
  it('explains an unknown .ton name and passes other errors through', async () => {
    const { nameError } = await import('~/lib/nfts-read/core')
    const { TonApiError } = await import('~/utils/api-client')
    // tonapi GET /v2/accounts/doesnotexist-zzqq.ton/nfts answered 400 {"error":"entity not found"} (2026-10-23).
    const unknown = new TonApiError('tonapi error 400: entity not found', 'tonapi', 400, 'https://tonapi.io/v2/accounts/doesnotexist-zzqq.ton/nfts')
    expect(String((nameError(unknown, 'doesnotexist-zzqq.ton', 'mainnet') as Error).message)).toMatch(/^doesnotexist-zzqq\.ton is not linked to any wallet on mainnet/)
    const busy = new TonApiError('rate limit', 'tonapi', 429, 'https://tonapi.io/v2/accounts/x.ton/nfts')
    expect(nameError(busy, 'x.ton', 'mainnet')).toBe(busy)
  })
})
