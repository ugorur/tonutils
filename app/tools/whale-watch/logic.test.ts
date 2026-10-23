import { describe, expect, it } from 'vitest'
import { parseKnownAccounts } from '~/lib/defi-analytics/shared'
import fx from './fixture-feed.json'
import type { ToncenterActions, ToncenterJettonTransfers } from './logic'
import { domainsFrom, fromJettonTransfers, fromTonActions, isWhale, labelOf, maxLt, mergeFeed, summarize } from './logic'

// Real mainnet responses fetched 2026-10-23 (trimmed to a few items): toncenter
// /api/v3/actions?action_type=ton_transfer&sort=desc&limit=100 and
// /api/v3/jetton/transfers?jetton_master=<USD₮>&sort=desc&limit=100. Labels: entries of tonkeeper/ton-assets accounts.json.
const KNOWN = parseKnownAccounts([
  { address: '0:3d7ee4917dc75c195b975a17b8fb7d367978fdc30bd9649200aa1255a93a3e57', name: 'Changelly 2' },
  { address: '-1:3333333333333333333333333333333333333333333333333333333333333333', name: 'Elector Contract' }
])

const coin = fromTonActions(fx.actions as ToncenterActions)
const usdt = fromJettonTransfers(fx.usdt as ToncenterJettonTransfers)

describe('parsing', () => {
  it('keeps successful GRAM transfers only, with exact nano amounts', () => {
    expect(coin).toHaveLength(5) // the failed 10000-nano transfer is dropped
    expect(coin[0]).toMatchObject({
      asset: 'coin',
      amount: 12000000000000n,
      from: '0:a9a640ea72d04504b54a17c87448295406fbe66ed83cebf560a15c088cdbb489',
      to: '0:ebc16e5676dc74fef1951279f95aef28eb1bd692b218f4ffb6e54811aa89d162',
      time: 1792739713
    })
    expect(coin[0]!.tx).toMatch(/^[A-Za-z0-9+/]{43}=$/)
  })

  it('reads USD₮ owners, 6-decimal amounts and text comments', () => {
    expect(usdt).toHaveLength(4)
    expect(usdt[0]).toMatchObject({ asset: 'usdt', amount: 101284000000n, from: '0:173f40f269f3b57c90ec4bb58aec1cc1329925e673203127c1f459f85039719d', time: 1792739719 })
    expect(usdt.find(t => t.amount === 750000n)?.comment).toBe('50 Telegram Stars \n\nRef#TF1RpoeOc')
    expect(usdt.find(t => t.amount === 10000000000n)?.comment).toBeUndefined() // empty comment
  })
})

describe('filtering and feed', () => {
  const f = { minCoin: 1000n * 10n ** 9n, minUsdt: 10000n * 10n ** 6n, includeMasterchain: false }

  it('applies per-asset thresholds', () => {
    // GRAM ≥ 1,000: 12,000 and 2,499.99; USD₮ ≥ 10,000: 101,284 and 10,000
    expect(coin.filter(t => isWhale(t, f)).map(t => t.amount)).toEqual([12000000000000n, 2499999905332n])
    expect(usdt.filter(t => isWhale(t, f)).map(t => t.amount)).toEqual([101284000000n, 10000000000n])
    expect(usdt.some(t => isWhale(t, { ...f, minUsdt: null }))).toBe(false)
  })

  it('hides masterchain (system → elector) transfers unless asked', () => {
    const sys = coin.find(t => t.from.startsWith('-1:'))!
    expect(isWhale(sys, { ...f, minCoin: 1n })).toBe(false)
    expect(isWhale(sys, { ...f, minCoin: 1n, includeMasterchain: true })).toBe(true)
  })

  it('merges newest first without duplicates and tracks the cursor', () => {
    const feed = mergeFeed(coin.slice(2), [...coin, ...usdt], 100)
    expect(feed).toHaveLength(9)
    expect(feed[0]!.time).toBe(Math.max(...feed.map(t => t.time)))
    expect(feed.map(t => t.time)).toEqual([...feed.map(t => t.time)].sort((a, b) => b - a))
    expect(mergeFeed([], feed, 3)).toHaveLength(3)
    expect(maxLt(coin, 0n)).toBe(coin.reduce((m, t) => (t.lt > m ? t.lt : m), 0n))
    expect(maxLt([], 7n)).toBe(7n)
  })

  it('sums the visible flow', () => {
    expect(summarize(usdt.filter(t => isWhale(t, f)))).toEqual({ count: 2, coin: 0n, usdt: 111284000000n })
  })
})

describe('labels', () => {
  const domains = new Map([...domainsFrom(fx.actions.address_book), ...domainsFrom(fx.usdt.address_book)])
  it('prefers known entities, then .ton domains', () => {
    expect(labelOf('0:3d7ee4917dc75c195b975a17b8fb7d367978fdc30bd9649200aa1255a93a3e57', KNOWN, domains)).toBe('Changelly 2')
    expect(labelOf('-1:3333333333333333333333333333333333333333333333333333333333333333', KNOWN, domains)).toBe('Elector Contract')
    expect(labelOf('0:1a271a7fea8f6a84c8ffc237d91b9101afc0d28ff2f1ea19ccaa461fd412d2ab', KNOWN, domains)).toBe('xn--zifrtta-bhg.ton')
    expect(labelOf('0:a9a640ea72d04504b54a17c87448295406fbe66ed83cebf560a15c088cdbb489', KNOWN, domains)).toBeUndefined()
  })
})
