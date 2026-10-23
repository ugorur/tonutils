import { describe, expect, it } from 'vitest'
import type { TcAddressBook, TcDnsRecord, TcNftItem } from '~/lib/dns-read/api'
import ownedFx from '../dns-expiry-checker/fixtures.json'
import fx from './fixtures.json'
import { buildReverse, fragmentUrl } from './logic'

// toncenter vectors, see fixtures.json _source. tonapi /v2/accounts/{tolya}/dns/backresolve returned
// ["baronpunycode.ton", "tolya.ton"] the same day: the names that point to the wallet and that it owns.
const TOLYA = 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4'
const FOUNDATION_OLD = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'
const HERSHY = 'UQCc-VPNP5gkPvprrKMPo9baDiiMtFBo5Gb01BOye8MpriXQ'

describe('buildReverse', () => {
  it('owner that points its own domains at itself (tolya.ton)', () => {
    const r = buildReverse(TOLYA, fx.tolyaRecords.records as TcDnsRecord[], ownedFx.owned as TcNftItem[], [], fx.tolyaRecords.address_book as TcAddressBook)
    expect(r.primary).toBe('tolya.ton')
    expect(r.pointing.map(p => p.domain).sort()).toEqual(['baronpunycode.ton', 'tolya.ton'])
    expect(r.pointing.every(p => p.ownedBySelf)).toBe(true)
    expect(r.ownedTon).toHaveLength(12)
    expect(r.ownedTon.filter(o => o.pointsHere).map(o => o.domain)).toEqual(['baronpunycode.ton', 'tolya.ton'])
  })
  it('wallet that domains point to but someone else controls (old TON Foundation wallet)', () => {
    const r = buildReverse(FOUNDATION_OLD, fx.foundationOldRecords.records as TcDnsRecord[], [], [], fx.foundationOldRecords.address_book as TcAddressBook)
    expect(r.primary).toBeNull()
    expect(r.pointing.map(p => [p.domain, p.ownedBySelf, p.owner])).toEqual([
      ['foundation.ton', false, '0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc'],
      ['just-for-test.ton', false, '0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc']
    ])
  })
  it('Telegram usernames', () => {
    const r = buildReverse(HERSHY, fx.hershyRecords.records as TcDnsRecord[], [], fx.hershyUsernames as TcNftItem[], fx.hershyRecords.address_book as TcAddressBook)
    expect(r.primary).toBe('hershy.t.me')
    expect(r.ownedUsernames.map(o => o.domain)).toEqual(['forgue.t.me', 'hershy.t.me', 'mrxpp.t.me', 'neurobyte.t.me', 'oxoca.t.me'])
    expect(r.ownedUsernames.find(o => o.domain === 'hershy.t.me')!.pointsHere).toBe(true)
    expect(fragmentUrl('hershy.t.me')).toBe('https://fragment.com/username/hershy')
  })
})
