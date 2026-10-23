import { describe, expect, it } from 'vitest'
import type { TcNftItemsPage } from '~/lib/nfts-read/core'
import { fetchCollectionItems, httpUrl, tcImage, toCollectionItem } from '~/lib/nfts-read/core'
import page from '~/lib/nfts-read/diamonds-0-149.fixture.json'
import { holderStats, itemCountLabel } from './logic'

// toncenter GET /api/v3/nft/items?collection_address=EQAG2BH0…Zbir (TON Diamonds)&limit=1000&offset=0,
// 2026-10-22, first 150 items (images dropped). Expected numbers come from an independent Python
// count over the same JSON (Counter over real_owner or owner_address).
const PAGE = page as unknown as TcNftItemsPage
const items = PAGE.nft_items.map(it => toCollectionItem(it, PAGE.metadata))

describe('holderStats', () => {
  it('counts real owners, listings and buckets', () => {
    const s = holderStats(items)
    expect(s.items).toBe(150)
    expect(s.ownerless).toBe(0)
    expect(s.unique).toBe(119)
    expect(s.listed).toBe(18)
    expect(s.holders.slice(0, 3).map(h => [h.owner, h.count])).toEqual([
      ['0:a7e9b9b09728c61e9400bb4d6d02bf09acbfc21b1bb4c49d887a070d1656c987', 8],
      ['0:0268a62e84e65948de5c1e2b449a9eaa48e8653d2ef201abd3b594d4605dc170', 6],
      ['0:7925d545ed140c944e5a9842b6910d0317c27b624a66fdc94f827535f488c163', 5]
    ])
    expect(s.buckets.map(b => [b.holders, b.items])).toEqual([[106, 106], [11, 30], [2, 14], [0, 0], [0, 0]])
    expect(s.top10Share).toBeCloseTo(0.25333333333333335, 12)
  })

  it('treats a listed item as owned by the seller', () => {
    // Diamond #12 (index 11): owner_address is the Getgems sale contract, real_owner the seller.
    const d = items.find(i => i.index === '11')!
    expect(d.onSale).toBe(true)
    expect(d.owner).toBe('0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca')
    expect(d.name).toBe('Diamond #12')
    expect(d.attributes).toHaveLength(7)
  })

  it('handles ownerless items', () => {
    const s = holderStats([{ ...items[0]!, owner: null }, items[1]!])
    expect(s.ownerless).toBe(1)
    expect(s.unique).toBe(1)
    expect(s.top10Share).toBe(1)
  })
})

describe('fetchCollectionItems', () => {
  it('pages until a short page and drops duplicates', async () => {
    const calls: unknown[] = []
    const v3 = async <T>(_path: string, q?: Record<string, unknown>) => {
      calls.push(q)
      const offset = Number(q!.offset)
      // 150 real items served 100 per page; the second page repeats the last item of the first.
      const slice = offset === 0 ? PAGE.nft_items.slice(0, 100) : PAGE.nft_items.slice(99, 150)
      return { ...PAGE, nft_items: slice } as T
    }
    const progress: number[] = []
    const res = await fetchCollectionItems(v3, 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir', { max: 100000, pageSize: 100, onProgress: n => progress.push(n) })
    expect(calls).toEqual([
      { collection_address: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir', limit: 100, offset: 0 },
      { collection_address: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir', limit: 100, offset: 100 }
    ])
    expect(res.complete).toBe(true)
    expect(res.items).toHaveLength(150)
    expect(progress).toEqual([100, 150])
  })

  it('waits out a rate-limited page instead of dropping the pages already read', async () => {
    const { TonApiError } = await import('~/utils/api-client')
    let failures = 2
    const v3 = async <T>(_p: string, q?: Record<string, unknown>) => {
      if (Number(q!.offset) === 100 && failures-- > 0) throw new TonApiError('rate limit', 'toncenter', 429, 'https://toncenter.com/api/v3/nft/items')
      return { ...PAGE, nft_items: PAGE.nft_items.slice(Number(q!.offset), Number(q!.offset) + Number(q!.limit)) } as T
    }
    const waits: number[] = []
    const res = await fetchCollectionItems(v3, 'x', { pageSize: 100, sleep: async (ms) => { waits.push(ms) } })
    expect(res).toMatchObject({ complete: true })
    expect(res.items).toHaveLength(150)
    expect(waits).toEqual([5000, 10000])
    // Other errors are not retried.
    const boom = async () => { throw new TonApiError('bad request', 'toncenter', 400, 'u') }
    await expect(fetchCollectionItems(boom, 'x', { sleep: async () => {} })).rejects.toThrow('bad request')
  })

  it('stops at max and reports incomplete', async () => {
    const v3 = async <T>(_p: string, q?: Record<string, unknown>) => ({ ...PAGE, nft_items: PAGE.nft_items.slice(Number(q!.offset), Number(q!.offset) + Number(q!.limit)) }) as T
    const res = await fetchCollectionItems(v3, 'x', { max: 120, pageSize: 100 })
    expect(res.items).toHaveLength(120)
    expect(res.complete).toBe(false)
  })
})

describe('itemCountLabel', () => {
  it('explains -1 (tonapi Telegram Usernames collection)', () => {
    expect(itemCountLabel(10000)).toBe('10,000')
    expect(itemCountLabel(-1)).toMatch(/Not sequential/)
  })
})

describe('tcImage', () => {
  // toncenter /api/v3/nft/items token_info (2026-10-23). proxy.toncenter.com returned 404 for the Diamond #2
  // proxy (source local:///sha256/…) and 200 image/png for the Vintage Cigar #17336 one (local:///46/40/…).
  const cigar = 'https://proxy.toncenter.com/S_-1A8mX65_jaRzyYon4hv3gvyARc2kxvRWGe_Fzyro/pr:medium/bG9jYWw6Ly8vNDYvNDAvNDY0MGI5YzJjMjQ1MjI2NThiNGFkODc3MzM4NTFhMjk5YmQ3YmQxNjNkNzYyYjkzODgzZjBkMmFlZmNiNTYxOA'
  const diamond = 'https://proxy.toncenter.com/R_IPVihvPtgO_3b-2Nybwv6aG2A0OAIXqPeHEIzjsXY/pr:medium/bG9jYWw6Ly8vc2hhMjU2LzdhY2JjMjUyNzNhNDMxNTNlODIzMDM5MzEwMWQ0MWE1YzNhZGI1M2M3M2M2Zjk3ZTBjYWVjNDdjNTgwMTI5NTU'
  it('skips sha256-keyed proxy images and keeps the working ones', () => {
    expect(tcImage({ type: 'nft_items', image: 'https://nft.ton.diamonds/nft/1/1.svg', extra: { _image_medium: diamond } }, 'medium')).toBe('https://nft.ton.diamonds/nft/1/1.svg')
    expect(tcImage({ type: 'nft_items', image: 'https://nft.fragment.com/gift/vintagecigar-17336.webp', extra: { _image_medium: cigar } }, 'medium')).toBe(cigar)
    expect(tcImage({ type: 'nft_items', image: 'ipfs://bafy/1.png' }, 'small')).toBe('https://gateway.pinata.cloud/ipfs/bafy/1.png')
  })

  it('moves images off dead IPFS gateways', () => {
    // Playmuse Frog #355: toncenter token_info image and its imgproxy URL (source https://ipfs.io/…/355.png).
    // Both ipfs.io and this imgproxy URL answered 429; gateway.pinata.cloud served the same CID as image/png (2026-10-23).
    const img = 'https://ipfs.io/ipfs/QmbScBHCdbyUZdxi4kPSbDRzQ3qQ5G4zQtbvPXKMsfQrNA/355.png'
    const proxy = 'https://imgproxy.toncenter.com/i2DpflumWFym-bSUif35dfyyheZJQ0uneY-iPEUebzE/pr:small/aHR0cHM6Ly9pcGZzLmlvL2lwZnMvUW1iU2NCSENkYnlVWmR4aTRrUFNiRFJ6UTNxUTVHNHpRdGJ2UFhLTXNmUXJOQS8zNTUucG5n'
    expect(tcImage({ type: 'nft_items', image: img, extra: { _image_small: proxy } }, 'small')).toBe('https://gateway.pinata.cloud/ipfs/QmbScBHCdbyUZdxi4kPSbDRzQ3qQ5G4zQtbvPXKMsfQrNA/355.png')
    expect(httpUrl('ipfs://ipfs/Qm1/a.png')).toBe('https://gateway.pinata.cloud/ipfs/Qm1/a.png')
    expect(httpUrl('https://nft.ton.diamonds/nft/1/1.svg')).toBe('https://nft.ton.diamonds/nft/1/1.svg')
    expect(httpUrl('javascript:alert(1)')).toBeUndefined()
  })
})
