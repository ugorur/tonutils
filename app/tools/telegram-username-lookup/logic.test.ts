import { describe, expect, it } from 'vitest'
import { displayName, indexSource, itemIndex, parseAuctionConfig, parseAuctionState, parseQuery, timeLeft } from './logic'

describe('parseQuery', () => {
  it('normalises every username form', () => {
    for (const s of ['@KatrinaKaif', 'katrinakaif', 't.me/katrinakaif', 'https://t.me/katrinakaif', 'katrinakaif.t.me', 'https://fragment.com/username/katrinakaif', ' @katrinakaif '])
      expect(parseQuery(s)).toEqual({ kind: 'username', name: 'katrinakaif' })
  })
  it('normalises +888 numbers', () => {
    for (const s of ['+888 0768 4929', '88807684929', '+888-0768-4929'])
      expect(parseQuery(s)).toEqual({ kind: 'number', digits: '88807684929' })
    expect(displayName({ kind: 'number', digits: '88807684929' })).toBe('+888 0768 4929') // tonapi metadata name of that NFT
  })
  it('rejects invalid input', () => {
    expect(() => parseQuery('')).toThrow()
    expect(() => parseQuery('+1 555 0100')).toThrow(/888/)
    expect(() => parseQuery('abc')).toThrow(/4 to 32/)
    expect(() => parseQuery('1abcd')).toThrow(/letter/)
    expect(() => parseQuery('hello world')).toThrow()
  })
})

// Expected indexes are the `index` field toncenter /api/v3/nft/items returned for these items (2026-10-22).
describe('itemIndex', () => {
  it('matches on-chain username indexes', async () => {
    // EQCPdrmDd7kKUL38HNfRZ1Hcf1-ZjsBeHwriRVJ2DYM7fV0a (@katrinakaif)
    expect(await itemIndex(indexSource(parseQuery('@katrinakaif')))).toBe('11416669731326170498805948956308358529588743782559201526969275966235700')
    // 0:0FBB562E43321F91AC212657B91DCA9311231F1406B308600A3E9E4F5D2EB7E5 (@totay)
    expect(await itemIndex('totay')).toBe('38245898364150336052293523517883515931767932378442369514082359393397759838616')
  })
  it('matches an on-chain +888 number index', async () => {
    // 0:6BE366AE463F1729F81C6BD5C30D457E5C01873A9C50F2C6F22B41E7D0FEA84D (+888 0768 4929)
    expect(await itemIndex(indexSource(parseQuery('+888 0768 4929')))).toBe('9604597126395707131061539893145877846351090743386360682585099482167288')
  })
})

// toncenter POST /api/v3/runGetMethod on 0:93B3D7095A7D0E9502D3C3E1F08F189363405D5FE22A2DAF854ADFED5FB1B387 (@walletmajor)
// during a live Fragment auction, 2026-10-22. Fragment showed "Minimum bid 2,988", ending 22 Oct 2026 20:08 UTC, "Buy for 2,999".
describe('auction parsing', () => {
  it('reads get_telemint_auction_state', () => {
    const s = parseAuctionState({ exit_code: 0, stack: [{ type: 'list', value: [] }, { type: 'num', value: '0x0' }, { type: 'num', value: '0x0' }, { type: 'num', value: '0x2b7b2adb800' }, { type: 'num', value: '0x6ada6d47' }] })
    expect(s).toEqual({ bidder: null, bid: 0n, bidTime: 0, minBid: 2_988_000_000_000n, endTime: 1792699719 })
    expect(new Date(s!.endTime * 1000).toISOString()).toBe('2026-10-22T20:08:39.000Z')
  })
  it('returns null when no auction runs (exit code 219, @katrinakaif)', () => {
    expect(parseAuctionState({ exit_code: 219, stack: [{ type: 'num', value: '0x0' }] })).toBeNull()
  })
  it('reads get_telemint_auction_config', () => {
    const c = parseAuctionConfig({ exit_code: 0, stack: [{ type: 'cell', value: 'te6cckEBAQEAJAAAQ4ARD6ToOSJByYTu9ujVM9Jyx0aGZfw+YDH6wI6LRfoD5/Dom/BU' }, { type: 'num', value: '0x2b7b2adb800' }, { type: 'num', value: '0x2ba42546600' }, { type: 'num', value: '0x5' }, { type: 'num', value: '0xe10' }, { type: 'num', value: '0x2d0' }] })
    // beneficiary decoded by hand from the cell bits (addr_std, wc 0); tonapi /v2/accounts confirms the account exists
    expect(c).toEqual({ beneficiary: '0:887d2741c9120e4c2777b746a99e93963a34332fe1f3018fd604745a2fd01f3f', initialMinBid: 2_988_000_000_000n, maxBid: 2_999_000_000_000n, minBidStepPercent: 5, minExtendTime: 3600, duration: 720 })
  })
})

describe('timeLeft', () => {
  it('formats the remaining time', () => {
    expect(timeLeft(1000, 1000)).toBe('ended')
    expect(timeLeft(1000 + 2 * 86400 + 4 * 3600, 1000)).toBe('2d 4h')
    expect(timeLeft(1000 + 3 * 3600 + 12 * 60, 1000)).toBe('3h 12m')
    expect(timeLeft(1000 + 30, 1000)).toBe('1m')
  })
})
