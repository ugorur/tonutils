import { describe, expect, it } from 'vitest'
import { dnsStatus, parseItemData } from '~/lib/dns-read/core'
import fx from '~/lib/dns-read/fixtures.json'
import type { BulkRow } from './logic'
import { csvRows, parseNames, priceTable, summarize } from './logic'

// Item data: toncenter /api/v3/accountStates?include_boc=true, 2026-10-22 (see lib/dns-read/fixtures.json).
const items = fx.items as Record<string, string>
const FOUNDATION = '0:78dfe54299fd7b3bb60c779d5f02f3a370c902c38e8dff724c0a87a01ff643a3'
const ANDREW = '0:a5b220f47cea27829af0edebd921863da4882d1a2a8d41ec3d8b1343a1a63328'
const NOW = 1792698000

describe('parseNames', () => {
  it('splits, cleans, validates and flags duplicates', () => {
    const r = parseNames('Foundation.ton\nfoundation, abc;  -bad  \n\nfree-name-123')
    expect(r.map(x => [x.name, x.error])).toEqual([
      ['foundation', ''],
      ['foundation', 'Duplicate'],
      ['abc', 'Too short: a .ton name needs at least 4 characters.'],
      ['-bad', 'A name cannot start or end with "-".'],
      ['free-name-123', '']
    ])
  })
})

describe('rows', () => {
  const rows: BulkRow[] = [
    { name: 'foundation', item: FOUNDATION, status: dnsStatus('foundation', parseItemData(items[FOUNDATION]!), NOW) },
    { name: 'andrewtelegram', item: ANDREW, status: dnsStatus('andrewtelegram', parseItemData(items[ANDREW]!), NOW) },
    { name: 'abcd', item: '0:00', status: dnsStatus('abcd', null, NOW) },
    { name: 'abc', error: 'Too short' }
  ]
  it('summarizes', () => {
    expect(summarize(rows)).toEqual({ available: 1, auction: 1, owned: 1, expired: 0, invalid: 1 })
  })
  it('exports CSV rows with exact amounts and friendly addresses', () => {
    const c = csvRows(rows)
    expect(c[0]).toMatchObject({ domain: 'foundation.ton', status: 'Taken', owner_or_leader: 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4', expires_utc: '2026-12-01 18:21 UTC' })
    expect(c[1]).toMatchObject({ status: 'In auction', price: '0.997086131', price_note: 'current bid', auction_ends_utc: '2026-10-22 19:55 UTC' })
    expect(c[2]).toMatchObject({ status: 'Available', price: '100', price_note: 'minimum opening bid' })
    expect(c[3]).toMatchObject({ status: 'Too short', price: '' })
  })
  it('price table follows get_min_price_config', () => {
    expect(priceTable(NOW).map(p => `${p.length}:${p.price / 1_000_000_000n}`)).toEqual(['4:100', '5:50', '6:40', '7:30', '8:20', '9:10', '10:5', '11+:1'])
  })
})
