import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { DomainLookup } from '~/lib/dns-write/dns'
import { domainStatus, itemAddress, itemCodeFromCollection, parseItemData } from '~/lib/dns-write/dns'
import fx from '~/lib/dns-write/fixtures/mainnet.json'
import { bidAction, bidMessage } from './logic'

// Fixtures: toncenter v3 /accountStates on mainnet .ton items, 2026-10-22 (see ~/lib/dns-write/dns.test.ts).
const NOW = 1_792_699_200
const COLLECTION = Address.parse('EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz')
const code = itemCodeFromCollection(fx.collection.data_boc)
function lookup(name: string, key?: keyof typeof fx.items): DomainLookup {
  const item = key ? parseItemData(Cell.fromBase64(fx.items[key].data_boc)) : null
  return { name, address: itemAddress(name, COLLECTION, code), balance: 0n, item }
}
const hash = (c: unknown) => (c as Cell).hash().toString('hex')

describe('start an auction', () => {
  it('sends the name as a text comment to the collection (real tx hiFPhMdJ… "axxa", 100 GRAM)', () => {
    const l = lookup('axxa')
    const a = bidAction(l, domainStatus(null, NOW), 'mainnet', 1_792_698_489)!
    expect(a).toMatchObject({ kind: 'start', to: 'EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz', min: 100_000_000_000n })
    const m = bidMessage(a, 'axxa', 100_000_000_000n)
    // in_msg body of that tx
    expect(hash(m.payload)).toBe(Cell.fromBase64('te6cckEBAQEACgAAEAAAAABheHhhfldtwQ==').hash().toString('hex'))
  })
  it('uses the testnet collection on testnet', () => {
    const a = bidAction(lookup('axxa'), { kind: 'free' }, 'testnet', NOW)!
    expect(Address.parse(a.to).equals(Address.parse('EQDjPtM6QusgMgWfl9kMcG-EALslbTITnKcH8VZK1pnH3UZA'))).toBe(true)
    expect(a.to.startsWith('kQ')).toBe(true)
  })
})

describe('bid', () => {
  it('plain transfer to the item, at least 5% over the top bid (fire.ton: 100 → 105 GRAM)', () => {
    const l = lookup('fire', 'fire')
    const a = bidAction(l, domainStatus(l.item, NOW), 'mainnet', NOW)!
    expect(a.kind).toBe('bid')
    expect(a.min).toBe(105_000_000_000n)
    expect(Address.parse(a.to).toRawString()).toBe(fx.items.fire.address.toLowerCase())
    expect(a.to.startsWith('EQ')).toBe(true)
    const m = bidMessage(a, 'fire', 105_000_000_000n)
    expect(m.payload).toBeUndefined()
    expect(() => bidMessage(a, 'fire', 104_999_999_999n)).toThrow()
  })
})

describe('release an expired domain', () => {
  it('foundation.ton one second after a year without renewal: release to the item for 5 GRAM (10 chars)', () => {
    const l = lookup('foundation', 'foundation')
    const later = l.item!.lastFillUpTime + 31_622_401
    const a = bidAction(l, domainStatus(l.item, later), 'mainnet', later)!
    expect(a).toMatchObject({ kind: 'release', min: 5_000_000_000n })
    expect(Address.parse(a.to).toRawString()).toBe(fx.items.foundation.address.toLowerCase())
  })
  it('price follows the name length (maybe.ton = 5 chars → 50 GRAM, as sent in J54Lo3hU…)', () => {
    const l = lookup('maybe', 'maybe')
    const fake = { kind: 'expired' as const, owner: null, expiresAt: 0 }
    const a = bidAction(l, fake, 'mainnet', 1_792_150_805)!
    expect(a.min).toBe(50_000_000_000n)
    const m = bidMessage(a, 'maybe', a.min)
    expect(hash(m.payload)).toBe(Cell.fromBase64('te6cckEBAQEADgAAGE7RS2UAAAAAAAAAAHRRKc0=').hash().toString('hex'))
  })
})

describe('nothing to send', () => {
  it('owned or won domains', () => {
    const l = lookup('foundation', 'foundation')
    expect(bidAction(l, domainStatus(l.item, NOW), 'mainnet', NOW)).toBeNull()
    const ax = lookup('axxa', 'axxa')
    expect(bidAction(ax, domainStatus(ax.item, 0x6ADA7689 + 1), 'mainnet', NOW)).toBeNull()
  })
})
