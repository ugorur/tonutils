import { describe, expect, it } from 'vitest'
import { cleanName, DNS_COLLECTION, dnsStatus, dnsTonOrgUrl, domainIndex, itemAddress, itemCodeFromCollectionData, minPrice, nameError, nextMinBid, ONE_YEAR, parseItemData } from './core'
import fx from './fixtures.json'

// Vectors: toncenter v3 accountStates / metadata / dns/records and tonapi /v2/dns/* read 2026-10-22;
// prices from dns-utils.fc get_min_price_config (github.com/ton-blockchain/dns-contract).
const FOUNDATION_ITEM = '0:78dfe54299fd7b3bb60c779d5f02f3a370c902c38e8dff724c0a87a01ff643a3'
const ANDREW_ITEM = '0:a5b220f47cea27829af0edebd921863da4882d1a2a8d41ec3d8b1343a1a63328'
const items = fx.items as Record<string, string>

describe('names', () => {
  it('cleans input', () => {
    expect(cleanName('  Foundation.TON ')).toBe('foundation')
    expect(cleanName('https://alice.ton/')).toBe('alice')
  })
  it('validates like the collection contract and dns.ton.org', () => {
    expect(nameError('foundation')).toBe('')
    expect(nameError('just-for-test')).toBe('')
    expect(nameError('abc')).toMatch(/at least 4/)
    expect(nameError('a'.repeat(126))).toBe('')
    expect(nameError('a'.repeat(127))).toMatch(/126/)
    expect(nameError('-abcd')).toMatch(/start or end/)
    expect(nameError('abcd-')).toMatch(/start or end/)
    expect(nameError('ab_cd')).toMatch(/a–z/)
    expect(nameError('wallet.foundation')).toMatch(/subdomain/)
  })
})

describe('item address', () => {
  it('index = slice_hash(name) (toncenter metadata nft_index of foundation.ton, same on testnet)', () => {
    expect(domainIndex('foundation')).toBe(70782259313930977839365630676579277100139423838741968489319188569929046817443n)
  })
  it('matches the deployed mainnet items', () => {
    const code = itemCodeFromCollectionData(fx.mainnetCollectionData)
    expect(code.hash().toString('base64')).toBe('i1/8nr/TkGTY1fVuRlnIJrt1k5I/XKSHKL5NYK9vUfk=')
    expect(itemAddress('foundation', DNS_COLLECTION.mainnet, code).toRawString()).toBe(FOUNDATION_ITEM)
    expect(itemAddress('andrewtelegram', DNS_COLLECTION.mainnet, code).toRawString()).toBe(ANDREW_ITEM)
  })
  it('matches the testnet foundation.ton item (different item code)', () => {
    const code = itemCodeFromCollectionData(fx.testnetCollectionData)
    expect(itemAddress('foundation', DNS_COLLECTION.testnet, code).toRawString()).toBe('0:3ebbac4c88220063bbdbee58dfcf34982b273c1074e2745094c042d825659d3c')
  })
})

describe('item data', () => {
  it('parses an owned domain (foundation.ton; tonapi expiring_at 1796149277)', () => {
    const d = parseItemData(items[FOUNDATION_ITEM]!)
    expect(d.domain).toBe('foundation')
    expect(d.owner).toBe('0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc')
    expect(d.auction).toBeNull()
    expect(d.lastFillUpTime + ONE_YEAR).toBe(1796149277)
    const st = dnsStatus('foundation', d, 1792699000)
    expect(st).toEqual({ kind: 'owned', owner: d.owner, expiresAt: 1796149277, won: false })
    expect(dnsStatus('foundation', d, 1796149278).kind).toBe('expired')
  })
  it('parses a running auction (andrewtelegram.ton; tonapi /dns/auctions: bidder 0:6b2a…, 0.997086131, ends 1792698953)', () => {
    const d = parseItemData(items[ANDREW_ITEM]!)
    expect(d.domain).toBe('andrewtelegram')
    expect(d.owner).toBeNull()
    expect(d.auction).toEqual({ bidder: '0:6b2ada8dde9a753e8d56e0e072fe5cdb3c6a93a8dbd26be92b207df08ee19667', bid: 997086131n, endTime: 1792698953 })
    // tonapi /dns/andrewtelegram.ton expiring_at = last bid + 1 year
    expect(d.lastFillUpTime + ONE_YEAR).toBe(1824317753)
    const live = dnsStatus('andrewtelegram', d, 1792698000)
    expect(live).toMatchObject({ kind: 'auction', bid: 997086131n, nextBid: 1046940437n })
    const after = dnsStatus('andrewtelegram', d, 1792698954)
    expect(after).toEqual({ kind: 'owned', owner: d.auction!.bidder, expiresAt: 1824317753, won: true })
  })
  it('missing account = available at the minimum price', () => {
    expect(dnsStatus('abcd', null, 1792699000)).toEqual({ kind: 'available', minPrice: 100_000_000_000n })
  })
})

describe('prices', () => {
  it('end prices after 21 months (now)', () => {
    const now = 1792699000
    expect([4, 5, 6, 7, 8, 9, 10, 11, 126].map(n => minPrice(n, now) / 1_000_000_000n)).toEqual([100n, 50n, 40n, 30n, 20n, 10n, 5n, 1n, 1n])
  })
  it('start prices decay 10% per 30 days from 2022-07-30', () => {
    expect(minPrice(4, 1659171600 + 10)).toBe(1000_000_000_000n)
    expect(minPrice(4, 1659171600 + 2592000)).toBe(900_000_000_000n)
  })
  it('outbid needs +5%', () => {
    expect(nextMinBid(100n)).toBe(105n)
  })
  it('links to dns.ton.org', () => {
    expect(dnsTonOrgUrl('foundation')).toBe('https://dns.ton.org/#foundation')
    expect(dnsTonOrgUrl('foundation', 'testnet')).toBe('https://dns.ton.org/?testnet=true#foundation')
  })
})
