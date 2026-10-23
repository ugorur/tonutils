import { describe, expect, it } from 'vitest'
import fixture from './fixture.json'
import type { TonapiNft } from './logic'
import { classify, giftSlug, parseOwner, summarize, toCollectible } from './logic'

// fixture.json: real items from tonapi GET /v2/accounts/UQBV8kYGxoQ6n-CbhgPKpxuqHoYeC3vd7kuTbu0OPvMF9bwQ/nfts?indirect_ownership=true
// (2026-10-22; the owner of Plush Pepe #1043 on fragment.com/gift/plushpepe-1043), previews trimmed, plus
// GET /v2/nfts/EQCPdrmDd7kKUL38HNfRZ1Hcf1-ZjsBeHwriRVJ2DYM7fV0a (@katrinakaif, listed on Getgems for 30,000).
const nfts = fixture.nft_items as TonapiNft[]
const find = (name: string) => nfts.find(n => n.metadata?.name === name || n.collection?.name === name)!

describe('classify', () => {
  it('recognises genuine Telegram collectibles', () => {
    expect(classify(find('@katrinakaif'))).toBe('username')
    expect(classify(find('Anonymous Telegram Numbers'))).toBe('number')
    expect(classify(find('Plush Pepe #1043'))).toBe('gift')
    expect(classify(find('Artisan Bricks'))).toBe('gift') // second gift code variant
  })
  it('flags tonapi-blacklisted lookalikes as scams', () => {
    expect(classify(find('GRAM Vouchers'))).toBe('scam')
    expect(classify(nfts.find(n => n.collection?.name?.startsWith('t.ме'))!)).toBe('scam')
  })
  it('leaves other NFTs alone', () => {
    expect(classify(find('TON DNS Domains'))).toBe('other')
    expect(classify(find('同款广告@xiatie'))).toBe('other')
  })
  it('does not trust gift code without the whitelist', () => {
    expect(classify({ ...find('Plush Pepe #1043'), trust: 'none' })).toBe('other')
  })
})

describe('toCollectible', () => {
  it('builds Fragment links and gift traits', () => {
    const pepe = toCollectible(find('Plush Pepe #1043'))
    expect(pepe.url).toBe('https://fragment.com/gift/plushpepe-1043') // the page we found the owner on
    expect(pepe.traits).toEqual([{ name: 'Model', value: 'Gummy Frog' }, { name: 'Backdrop', value: 'Electric Purple' }, { name: 'Symbol', value: 'Trophy' }])
    expect(toCollectible(find('Anonymous Telegram Numbers')).url).toBe('https://fragment.com/number/88806961735')
    expect(toCollectible(find('@katrinakaif')).url).toBe('https://fragment.com/username/katrinakaif')
    expect(giftSlug('https://example.com/gift/x.webp')).toBeUndefined()
  })
  it('reads the sale price', () => {
    expect(toCollectible(find('@katrinakaif')).sale).toEqual({ market: 'Getgems Sales', nano: 30_000_000_000_000n, decimals: 9, symbol: null })
  })
})

describe('summarize', () => {
  it('groups the wallet', () => {
    const s = summarize(nfts)
    expect(s.usernames.map(u => u.name)).toEqual(['@katrinakaif', '@trapflow'])
    expect(s.numbers).toHaveLength(1)
    expect(s.giftCount).toBe(2)
    expect(s.gifts.map(g => g.collection).sort()).toEqual(['Artisan Bricks', 'Plush Pepes'])
    expect(s.scams).toHaveLength(2)
    expect(s.otherCount).toBe(2)
    expect(s.listed).toBe(1)
    expect(s.listedNativeNano).toBe(30_000_000_000_000n)
  })
})

describe('parseOwner', () => {
  it('accepts addresses and .ton domains', () => {
    // fixture owner: raw form from tonapi, friendly form from fragment.com
    expect(parseOwner('UQBV8kYGxoQ6n-CbhgPKpxuqHoYeC3vd7kuTbu0OPvMF9bwQ')).toBe('0:55f24606c6843a9fe09b8603caa71baa1e861e0b7bddee4b936eed0e3ef305f5')
    expect(parseOwner(' Yung.TON ')).toBe('yung.ton')
    expect(() => parseOwner('durov')).toThrow(/address/)
  })
})
