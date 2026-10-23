import { describe, expect, it } from 'vitest'
import { csvRows, imageUrl, listUrl, mergeRows, pct, toRows, usd, type ApiJetton } from './logic'

// Real response of GET https://tokens.swap.coffee/api/v3/hybrid-search?kind=DEXES&sort=TVL&size=3&page=1&verification=WHITELISTED
// fetched 2026-10-22 (labels/created_at and unused market fields removed).
const PAGE: ApiJetton[] = [{"type": "common", "address": "0:0000000000000000000000000000000000000000000000000000000000000000", "decimals": 9, "total_supply": "5127180163000000000", "name": "Gram", "symbol": "GRAM", "mintable": false, "verification": "WHITELISTED", "image_url": "https://cdn.swap.coffee/p/NL-vx6dsgkhbquhwJwpZFJ9qRPftQNv4oHiaYkn28Sw/rs:fill:200:200:1/g:no/aHR0cHM6Ly9zdG9yYWdlLmNvZmZlZS5hZ2VuY3kvZ2VuZXJpYy9ncmFtLnBuZw.webp", "market_stats": {"holders_count": 0, "price_usd": 1.31723633677609, "price_change_24h": -2.67948, "volume_usd_24h": 2883660.0, "tvl_usd": 256053000, "mcap": 6753708000, "fdmc": 6753708000, "trust_score": 100}}, {"type": "common", "address": "0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000", "decimals": 9, "total_supply": "121951629548404577", "name": "Tonstakers TON", "symbol": "tsTON", "mintable": true, "verification": "WHITELISTED", "image_url": "https://cache.tonapi.io/imgproxy/GjhSro_E6Qxod2SDQeDhJA_F3yARNomyZFKeKw8TVOU/rs:fill:200:200:1/g:no/aHR0cHM6Ly90b25zdGFrZXJzLmNvbS9qZXR0b24vbG9nby5zdmc.webp", "market_stats": {"holders_count": 144260, "price_usd": 1.49260980167958, "price_change_24h": -2.67725, "volume_usd_24h": 1195460.0, "tvl_usd": 197569000, "mcap": 182026190, "fdmc": 182026190, "trust_score": 100}}, {"type": "common", "address": "0:aa0ba121449feda569e02b12fa755d24e834a7454aecf4649590b6df742aac8f", "decimals": 9, "total_supply": "17664677853407985", "name": "Staked TON", "symbol": "STAKED", "mintable": true, "verification": "WHITELISTED", "image_url": "https://cache.tonapi.io/imgproxy/35bhbRQXWWAlXhdh0qs6wV8FkCMzI7dB78DEzkXYQoY/rs:fill:200:200:1/g:no/aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL215dG9ud2FsbGV0b3JnL3Rvbi1tZXRhZGF0YS9tYWluL210d1RPTi9TVEFLRUQucG5n.webp", "market_stats": {"holders_count": 15901, "price_usd": 1.57125214567325, "price_change_24h": 0.0, "volume_usd_24h": 0.0, "tvl_usd": 27213400, "mcap": 27562786, "fdmc": 27562786, "trust_score": 38}}]

// Real memepad item (kind=MEMES_ALL), fetched the same day: no holders/verification fields.
const MEMEPAD: ApiJetton = { type: 'memepad', address: '0:562a19d392749d589685325bf4545ef63f6c7487f501b431ae27e27e733b5895', decimals: 9, name: 'GABBER', symbol: 'GABBY', market_stats: { price_usd: 0.000014, tvl_usd: 1697.53 } }

describe('listUrl', () => {
  it('browse: DEXES kind, sort, one verification param per level', () => {
    const u = new URL(listUrl({ sort: 'TVL', level: 'community', page: 2 }))
    expect(u.origin + u.pathname).toBe('https://tokens.swap.coffee/api/v3/hybrid-search')
    expect(u.searchParams.get('kind')).toBe('DEXES')
    expect(u.searchParams.get('sort')).toBe('TVL')
    expect(u.searchParams.getAll('verification')).toEqual(['WHITELISTED', 'COMMUNITY'])
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('size')).toBe('50')
  })
  it('search: ALL kind, no sort, COMMUNITY always included (API rule)', () => {
    const u = new URL(listUrl({ search: ' dogs ', sort: 'TVL', level: 'verified', page: 1 }))
    expect(u.searchParams.get('kind')).toBe('ALL')
    expect(u.searchParams.get('search')).toBe('dogs')
    expect(u.searchParams.has('sort')).toBe(false)
    expect(u.searchParams.getAll('verification')).toEqual(['WHITELISTED', 'COMMUNITY'])
  })
  it('price change sorts descending', () => {
    expect(new URL(listUrl({ sort: 'PRICE_CHANGE_24H', level: 'all', page: 1 })).searchParams.get('direction')).toBe('DESC')
  })
})

describe('toRows', () => {
  const rows = toRows(PAGE)
  it('maps the real page', () => {
    expect(rows.map(r => r.symbol)).toEqual(PAGE.map(p => p.symbol))
    const ts = rows.find(r => r.symbol === 'tsTON')!
    expect(ts.raw).toBe('0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000')
    expect(ts.verification).toBe('verified')
    expect(ts.holders).toBeGreaterThan(100000)
    expect(ts.decimals).toBe(9)
  })
  it('native coin: flagged, no fake 0 holders', () => {
    const gram = rows[0]!
    expect(gram.native).toBe(true)
    expect(gram.holders).toBeUndefined()
  })
  it('memepad items without stats still map', () => {
    const [m] = toRows([MEMEPAD])
    expect(m).toMatchObject({ symbol: 'GABBY', verification: 'unverified', holders: undefined, tvl: 1697.53 })
  })
  it('mergeRows drops duplicates across pages', () => {
    expect(mergeRows(rows, rows.slice(1)).length).toBe(rows.length)
  })
  it('csvRows', () => {
    const c = csvRows(rows, r => `F(${r})`)
    expect(c[0]).toMatchObject({ rank: 1, symbol: 'GRAM', master: '' })
    expect(c[1]!.master).toBe(`F(${rows[1]!.raw})`)
  })
})

describe('imageUrl', () => {
  it('unwraps cdn.swap.coffee imgproxy URLs (403 cross-site) to the source image', () => {
    expect(imageUrl(PAGE[0]!.image_url)).toBe('https://storage.coffee.agency/generic/gram.png')
    expect(toRows(PAGE)[0]!.image).toBe('https://storage.coffee.agency/generic/gram.png')
  })
  it('keeps other hosts', () => {
    expect(imageUrl(PAGE[1]!.image_url)).toBe(PAGE[1]!.image_url)
    expect(imageUrl(undefined)).toBeUndefined()
  })
})

describe('formatting', () => {
  it('usd', () => {
    expect(usd(6753708000)).toBe('$6.75B')
    expect(usd(21018900)).toBe('$21.02M')
    expect(usd(825181)).toBe('$825.2K')
    expect(usd(1.31723633677609)).toBe('$1.32')
    expect(usd(0.000014)).toBe('$0.0000140')
    expect(usd(1.41e-9)).toBe('$0.00000000141') // TON FISH price on 2026-10-23, no exponent
    expect(usd(0.499)).toBe('$0.499')
    expect(usd(undefined)).toBe('—')
  })
  it('pct', () => {
    expect(pct(-2.67948)).toBe('-2.68%')
    expect(pct(3.5)).toBe('+3.50%')
  })
})
