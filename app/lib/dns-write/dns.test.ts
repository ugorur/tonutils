import { createHash } from 'node:crypto'
import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import {
  adnlRecord, changeRecordBody, domainStatus, firstAuctionDuration, itemAddress, itemCodeFromCollection, lookupInput, minNextBid, minPrice,
  nextResolverRecord, normalizeDomain, parseBytes32, parseItemData, parseRecord, RECORD_KEYS, releaseBody, renewBody, storageRecord,
  relativeTime, walletMaxMessages, walletRecord
} from './dns'
import fx from './fixtures/mainnet.json'

// Vectors: mainnet, read 2026-10-22.
//  - fixtures/mainnet.json: toncenter v3 /accountStates (collection EQC3dN…z0Bz and five .ton items).
//  - get methods: toncenter v2 runGetMethod on the same items (get_auction_info, get_last_fill_up_time).
//  - bodies: in_msg bodies of real item transactions (toncenter v3 /transactions), cited by tx hash.
const NOW = 1_792_699_200
const COLLECTION = Address.parse('EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz')
const code = itemCodeFromCollection(fx.collection.data_boc)
const item = (k: keyof typeof fx.items) => parseItemData(Cell.fromBase64(fx.items[k].data_boc))
const boc = (c: Cell) => c.toBoc({ idx: false, crc32: false }).toString('base64')
const same = (c: Cell, b64: string) => expect(c.hash().toString('hex')).toBe(Cell.fromBase64(b64).hash().toString('hex'))

describe('record keys', () => {
  it('are sha256 of the category names (TEP-81)', () => {
    for (const [name, key] of Object.entries(RECORD_KEYS))
      expect(key.toString(16).padStart(64, '0')).toBe(createHash('sha256').update(name).digest('hex'))
  })
})

describe('normalizeDomain', () => {
  it('accepts names with or without .ton, any case', () => {
    expect(normalizeDomain(' Foundation.TON ')).toEqual({ ok: true, name: 'foundation' })
    expect(normalizeDomain('https://alice-bob.ton/')).toEqual({ ok: true, name: 'alice-bob' })
  })
  it('converts unicode names to punycode (RFC 3492 example)', () => {
    expect(normalizeDomain('münchen.ton')).toEqual({ ok: true, name: 'xn--mnchen-3ya' })
  })
  it('applies the collection limits', () => {
    expect(normalizeDomain('abc').ok).toBe(false)
    expect(normalizeDomain('-abcd').ok).toBe(false)
    expect(normalizeDomain('abcd-').ok).toBe(false)
    expect(normalizeDomain('ab_cd').ok).toBe(false)
    expect(normalizeDomain('a'.repeat(127)).ok).toBe(false)
    expect(normalizeDomain('a'.repeat(126)).ok).toBe(true)
    expect(normalizeDomain('sub.alice.ton').ok).toBe(false)
  })
  it('sends Telegram names to Fragment', () => {
    expect(normalizeDomain('durov.t.me')).toMatchObject({ ok: false, fragment: true })
    expect(normalizeDomain('+888 0000 0000')).toMatchObject({ ok: false, fragment: true })
  })
})

describe('item address', () => {
  it('matches real .ton items', () => {
    // axxa: deployed by collection tx hiFPhMdJYimLw9C4xtocuhcAbrSRxRiWIF7bAR0zvB0= (out msg with StateInit to 0:9D61…).
    expect(itemAddress('axxa', COLLECTION, code).toRawString()).toBe(fx.items.axxa.address.toLowerCase())
    // The others: tonapi /v2/dns/<name> item.address and toncenter v3 /dns/records nft_item_address.
    expect(itemAddress('foundation', COLLECTION, code).toRawString()).toBe(fx.items.foundation.address.toLowerCase())
    expect(itemAddress('fire', COLLECTION, code).toRawString()).toBe(fx.items.fire.address.toLowerCase())
    expect(itemAddress('krasnoeibeloe', COLLECTION, code).toRawString()).toBe(fx.items.krasnoeibeloe.address.toLowerCase())
    expect(itemAddress('maybe', COLLECTION, code).toRawString()).toBe(fx.items.maybe.address.toLowerCase())
  })
})

describe('parseItemData', () => {
  it('reads an owned domain with records (foundation.ton)', () => {
    const s = item('foundation')
    expect(s.domain).toBe('foundation')
    expect(s.owner?.toRawString()).toBe('0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc') // v3 dns/records nft_item_owner
    expect(s.auction).toBeNull() // get_auction_info → (null, 0, 0)
    expect(s.lastFillUpTime).toBe(0x692C8B1D) // get_last_fill_up_time
    // toncenter v3 /dns/records: dns_wallet, dns_site_adnl, dns_storage_bag_id
    const w = parseRecord(s.records.get(RECORD_KEYS.wallet)!)
    expect(w.type === 'wallet' && w.address.toRawString()).toBe('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(parseRecord(s.records.get(RECORD_KEYS.site)!)).toEqual({ type: 'adnl', hex: Buffer.from('UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ=', 'base64').toString('hex') })
    expect(parseRecord(s.records.get(RECORD_KEYS.storage)!)).toEqual({ type: 'storage', hex: Buffer.from('f+p68jJfCltpCJOcnXL5LbTAylLMqM4sSLsnCL8YhUE=', 'base64').toString('hex') })
  })
  it('reads a released domain in auction (fire.ton)', () => {
    const s = item('fire')
    expect(s.owner).toBeNull()
    // get_auction_info: (0:1f00…ba, 0x174876e800, 0x6add9788); get_last_fill_up_time 0x6ad45d08
    expect(s.auction?.maxBidder?.toRawString()).toBe('0:1f00019339e0d0a100fbb145d137510527498c05b78c9b3370044bd3c7e7aeba')
    expect(s.auction?.maxBid).toBe(0x174876E800n)
    expect(s.auction?.endTime).toBe(0x6ADD9788)
    expect(s.lastFillUpTime).toBe(0x6AD45D08)
  })
  it('reads a fresh first auction (axxa.ton)', () => {
    const s = item('axxa')
    // get_auction_info: (0:7d14…44, 0x174853b0e4, 0x6ada7689); bid = value the collection forwarded (99997692132)
    expect(s.auction?.maxBidder?.toRawString()).toBe('0:7d1425abec9ea89cfcbd80cf4d4f09cda450147bcb8ee324667d76ce093dec44')
    expect(s.auction?.maxBid).toBe(99_997_692_132n)
    expect(s.auction?.endTime).toBe(0x6ADA7689)
  })
})

describe('domainStatus', () => {
  it('auction: 5% over the top bid', () => {
    expect(domainStatus(item('fire'), NOW)).toMatchObject({ kind: 'auction', minNextBid: 105_000_000_000n })
    expect(minNextBid(99_997_692_132n)).toBe(104_997_576_738n)
  })
  it('owned → expired after one year without an owner action', () => {
    const s = item('foundation')
    expect(domainStatus(s, NOW)).toMatchObject({ kind: 'owned', expiresAt: 0x692C8B1D + 31_622_400 })
    expect(domainStatus(s, 0x692C8B1D + 31_622_401).kind).toBe('expired')
  })
  it('won but not claimed after the auction ends', () => {
    const s = item('axxa')
    const st = domainStatus(s, 0x6ADA7689 + 1)
    expect(st.kind).toBe('won')
    expect(st.kind === 'won' && st.winner?.toRawString()).toBe('0:7d1425abec9ea89cfcbd80cf4d4f09cda450147bcb8ee324667d76ce093dec44')
  })
  it('free when the item does not exist', () => {
    expect(domainStatus(null, NOW).kind).toBe('free')
  })
})

describe('prices and durations', () => {
  it('match real auction starts', () => {
    // hiFPhM…: "axxa" (4 chars) with exactly 100 GRAM, exit 0; M5WL8f…: "vaffanculo" (10) with 5 GRAM; 10+ chars with 1 GRAM.
    expect(minPrice(4, 1_792_698_489)).toBe(100_000_000_000n)
    expect(minPrice(10, 1_792_695_553)).toBe(5_000_000_000n)
    expect(minPrice(14, NOW)).toBe(1_000_000_000n)
    // axxa: collection tx at 1792698489, auction end 0x6ada7689 = +3600 s
    expect(firstAuctionDuration(1_792_698_489)).toBe(0x6ADA7689 - 1_792_698_489)
  })
})

describe('message bodies', () => {
  it('renew = change_dns_record key 0, no value', () => {
    // fire.ton item, tx iDvDWjjkwJSObMYLoFTePSAHNmeZKs8Jv3/Yw3HQxP4= (0.02 GRAM, exit 0)
    same(renewBody(), 'te6cckEBAQEALgAAWE6x8PkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMPrTzw==')
    // maybe.ton item, tx oXS4jdlVnU20XnCbh1VF+HVg2pN2F0wFW1nnQECuNgY= (query_id 1760523779)
    same(renewBody(1_760_523_779n), 'te6cckEBAQEALgAAWE6x8PkAAAAAaO92AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZsfd/g==')
  })
  it('set and delete the wallet record', () => {
    // fire.ton item, tx qcJu6SGbqw5s3eIAD2ahYqVNRerofm6g06NqnraFslU=
    const w = walletRecord(Address.parse('0:6F8D7AC29334BCC3E3600A26FF8B53336C184C31E6B7150AC9F375075BA04695'))
    same(changeRecordBody(RECORD_KEYS.wallet, w), 'te6cckEBAgEAVgABWE6x8PkAAAAAAAAAAOjUQFCHPbqGWqfBcKtMzmTZCDmjTc/Wz3HRTgIFRDsbAQBJn9OADfGvWFJml5h8bAFE3/FqZm2DCYY81uKhWT5uoOt0CNKgEF9XOMc=')
    // fire.ton item, tx xkSLfEGM2W6CBCABXdrIjdMvMyBuq6ps1dXZ3ijkkpA=
    same(changeRecordBody(RECORD_KEYS.wallet, null), 'te6cckEBAQEALgAAWE6x8PkAAAAAAAAAAOjUQFCHPbqGWqfBcKtMzmTZCDmjTc/Wz3HRTgIFRDsb6aFTQw==')
  })
  it('release an expired domain', () => {
    // fire.ton tx BITTPD6M… (query_id 13) and maybe.ton tx J54Lo3hU… (query_id 0)
    same(releaseBody(13n), 'te6cckEBAQEADgAAGE7RS2UAAAAAAAAADacdAXI=')
    same(releaseBody(), 'te6cckEBAQEADgAAGE7RS2UAAAAAAAAAAHRRKc0=')
  })
  it('record cells match the ones stored on chain (foundation.ton)', () => {
    const s = item('foundation')
    const val = (k: bigint) => boc(s.records.get(k)!)
    expect(boc(walletRecord(Address.parse('0:83DFD552E63729B472FCBCC8C45EBCC6691702558B68EC7527E1BA403A0F31A8')))).toBe(val(RECORD_KEYS.wallet))
    expect(boc(adnlRecord(parseBytes32('UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ=')!))).toBe(val(RECORD_KEYS.site))
    expect(boc(storageRecord(parseBytes32('f+p68jJfCltpCJOcnXL5LbTAylLMqM4sSLsnCL8YhUE=')!))).toBe(val(RECORD_KEYS.storage))
  })
  it('next resolver cell matches the testnet root DNS answer for "ton"', () => {
    // testnet toncenter v2 runGetMethod dnsresolve("ton\0", 0) on root -1:efe71d…7da0 (config param 4)
    same(nextResolverRecord(Address.parse('EQDjPtM6QusgMgWfl9kMcG-EALslbTITnKcH8VZK1pnH3UZA')), 'te6cckEBAQEAJgAAR7qTgBxn2mdIXWQGQLPy+yGODfCAF2StpkJzlOD+Ksla0zj7sO/0J1M=')
    expect(parseRecord(Cell.fromBase64('te6cckEBAQEAJgAAR7qTgBxn2mdIXWQGQLPy+yGODfCAF2StpkJzlOD+Ksla0zj7sO/0J1M=')).type).toBe('next_resolver')
  })
})

describe('helpers', () => {
  it('parseBytes32 accepts hex and base64 only', () => {
    expect(parseBytes32('7fea7af2325f0a5b6908939c9d72f92db4c0ca52cca8ce2c48bb2708bf188541')).toEqual(parseBytes32('f+p68jJfCltpCJOcnXL5LbTAylLMqM4sSLsnCL8YhUE='))
    expect(parseBytes32('abc')).toBeNull()
  })
  it('walletMaxMessages reads the SendTransaction feature', () => {
    expect(walletMaxMessages(['SendTransaction', { name: 'SendTransaction', maxMessages: 255 }])).toBe(255)
    expect(walletMaxMessages(['SendTransaction'])).toBe(4)
  })
  it('relativeTime never says "tomorrow" for a time two calendar days away', () => {
    expect(relativeTime(NOW + 41 * 3600, NOW)).toBe('in 1 day')
    expect(relativeTime(NOW - 3 * 86_400, NOW)).toBe('3 days ago')
  })
})

describe('lookupInput', () => {
  it('rejects an address with no deployed contract instead of showing a nameless domain', async () => {
    const v3 = (async () => ({ accounts: [] })) as never
    await expect(lookupInput(v3, 'mainnet', '0:0000000000000000000000000000000000000000000000000000000000000001')).rejects.toThrow(/No \.ton domain contract/)
  })
})
