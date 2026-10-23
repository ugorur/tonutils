import { describe, expect, it } from 'vitest'
import { parseItemData } from '~/lib/dns-read/core'
import fx from '~/lib/dns-read/fixtures.json'
import type { TaAuction } from './logic'
import { applyFilters, bidUrl, csvRows, toRows, withChainState } from './logic'

// tonapi GET /v2/dns/auctions?tld=ton and ?tld=t.me, 2026-10-22 (subset).
const TON: TaAuction[] = [
  { domain: 'andrewtelegram.ton', owner: '0:6b2ada8dde9a753e8d56e0e072fe5cdb3c6a93a8dbd26be92b207df08ee19667', price: 997086131, bids: 1, date: 1792698953 },
  { domain: 'vaffanculo.ton', owner: '0:74cb8df18e6dd3862b665854868bcbd4fee6b2124e2f5250e0ba50432ae7b787', price: 4997316798, bids: 1, date: 1792699153 },
  { domain: 'fire.ton', owner: '0:1f00019339e0d0a100fbb145d137510527498c05b78c9b3370044bd3c7e7aeba', price: 100000000000, bids: 23, date: 1792907144 },
  { domain: 'sick.ton', owner: '0:ba88deb994773f71b0735cd945d3459b6e9ce20c8f0632e16f9ba76d5fa033aa', price: 100000000000, bids: 3, date: 1793265402 },
  { domain: 'plohoyparen.ton', owner: '0:651536d85449e5dd4e2022449eeabeb1078203588ccb77d08a4a5ce6494b443e', price: 1000000000, bids: 12, date: 1793299650 }
]
const TME: TaAuction[] = [
  { domain: 'catbud.t.me', owner: '0:2dcf328574ca7523e8286eca70e60981d48b1c1a7ee406d729d84a1e3489e8f4', price: 5800000000, bids: 140, date: 1792698883 }
]
const NOW = 1792698000

describe('toRows', () => {
  it('splits name and TLD', () => {
    const [r] = toRows(TME, 't.me')
    expect(r).toMatchObject({ name: 'catbud', tld: 't.me', price: 5800000000n, bids: 140, endTime: 1792698883 })
  })
  it('matches the on-chain auction of andrewtelegram.ton (end time = tonapi date, bid = price, leader = owner)', () => {
    const chain = parseItemData((fx.items as Record<string, string>)['0:a5b220f47cea27829af0edebd921863da4882d1a2a8d41ec3d8b1343a1a63328']!).auction!
    const [r] = toRows(TON, 'ton')
    expect([r!.endTime, r!.price, r!.owner]).toEqual([chain.endTime, chain.bid, chain.bidder])
  })
})

describe('applyFilters', () => {
  const rows = toRows(TON, 'ton')
  it('sorts by ending soon by default and drops ended auctions', () => {
    expect(applyFilters(rows, { q: '', sort: 'ending' }, NOW).map(r => r.name)).toEqual(['andrewtelegram', 'vaffanculo', 'fire', 'sick', 'plohoyparen'])
    expect(applyFilters(rows, { q: '', sort: 'ending' }, 1792699000).map(r => r.name)).toEqual(['vaffanculo', 'fire', 'sick', 'plohoyparen'])
  })
  it('filters by keyword and length', () => {
    expect(applyFilters(rows, { q: 'FIRE.ton', sort: 'ending' }, NOW).map(r => r.name)).toEqual(['fire'])
    expect(applyFilters(rows, { q: '', minLen: 4, maxLen: 4, sort: 'ending' }, NOW).map(r => r.name)).toEqual(['fire', 'sick'])
  })
  it('sorts by price, bids and length', () => {
    expect(applyFilters(rows, { q: '', sort: 'price-desc' }, NOW).map(r => r.name).slice(0, 2)).toEqual(['fire', 'sick'])
    expect(applyFilters(rows, { q: '', sort: 'price-asc' }, NOW)[0]!.name).toBe('andrewtelegram')
    expect(applyFilters(rows, { q: '', sort: 'bids' }, NOW)[0]!.name).toBe('fire')
    expect(applyFilters(rows, { q: '', sort: 'shortest' }, NOW).map(r => r.name).slice(0, 2)).toEqual(['fire', 'sick'])
  })
})

describe('links and CSV', () => {
  it('links to the right marketplace', () => {
    expect(bidUrl(toRows(TON, 'ton')[2]!)).toBe('https://dns.ton.org/#fire')
    expect(bidUrl(toRows(TME, 't.me')[0]!)).toBe('https://fragment.com/username/catbud')
  })
  it('exports exact bids', () => {
    expect(csvRows(toRows(TON, 'ton'))[0]).toEqual({ domain: 'andrewtelegram.ton', current_bid: '0.997086131', bids: 1, ends_utc: '2026-10-22 19:55 UTC' })
  })
})

describe('withChainState', () => {
  it('takes bid, leader and end time from the contract and drops auctions the contract says are over', () => {
    const chain = new Map([
      ['andrewtelegram', parseItemData((fx.items as Record<string, string>)['0:a5b220f47cea27829af0edebd921863da4882d1a2a8d41ec3d8b1343a1a63328']!)],
      // foundation.ton item data: owned, no auction
      ['fire', parseItemData((fx.items as Record<string, string>)['0:78dfe54299fd7b3bb60c779d5f02f3a370c902c38e8dff724c0a87a01ff643a3']!)]
    ])
    const stale = toRows([{ ...TON[0]!, price: 1, date: 1 }, TON[2]!, TON[3]!], 'ton')
    const out = withChainState(stale, chain)
    expect(out[0]).toMatchObject({ price: 997086131n, endTime: 1792698953, onChain: true })
    expect(out[1]).toMatchObject({ endTime: 0, onChain: true })
    expect(out[2]).toEqual(stale[2])
    expect(withChainState(toRows(TME, 't.me'), chain)).toEqual(toRows(TME, 't.me'))
  })
})
