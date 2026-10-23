import { ADNLAddress } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { bidRows, parseDomain, recordRows } from './logic'

// toncenter /api/v3/dns/records?domain=foundation.ton, read 2026-10-22.
const FOUNDATION = {
  nft_item_address: '0:78DFE54299FD7B3BB60C779D5F02F3A370C902C38E8DFF724C0A87A01FF643A3',
  nft_item_owner: '0:9DA971AF38D2F03ABDF308D5F91636A97E5A2B07A66C39D71D7CBAE3B032EDDC',
  domain: 'foundation.ton',
  dns_next_resolver: null,
  dns_wallet: '0:83DFD552E63729B472FCBCC8C45EBCC6691702558B68EC7527E1BA403A0F31A8',
  dns_site_adnl: 'UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ=',
  dns_storage_bag_id: 'f+p68jJfCltpCJOcnXL5LbTAylLMqM4sSLsnCL8YhUE='
}

describe('parseDomain', () => {
  it('accepts names with or without .ton', () => {
    expect(parseDomain('Foundation.ton')).toEqual({ name: 'foundation', error: '' })
    expect(parseDomain('foundation')).toEqual({ name: 'foundation', error: '' })
    expect(parseDomain('')).toEqual({ name: '', error: '' })
    expect(parseDomain('ton').error).toMatch(/at least 4/)
  })
})

describe('recordRows', () => {
  it('maps foundation.ton records', () => {
    const rows = recordRows(FOUNDATION)
    expect(rows.map(r => r.key)).toEqual(['wallet', 'site', 'storage'])
    // tonapi /v2/dns/foundation.ton/resolve: wallet 0:83dfd5…, storage 7fea7af2…
    expect(rows[0]!.value).toBe('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(rows[2]!.value).toBe('7fea7af2325f0a5b6908939c9d72f92db4c0ca52cca8ce2c48bb2708bf188541')
    expect(rows[1]!.value).toBe('516618cf6cbe9004f6883e742c9a2e3ca53ed02e3e36f4cef62a98ee1e449174')
    expect(rows[1]!.adnl).toHaveLength(55)
    expect(ADNLAddress.parseFriendly(rows[1]!.adnl!).address.toString('hex')).toBe(rows[1]!.value)
  })
  it('handles no record', () => {
    expect(recordRows(null)).toEqual([])
  })
})

describe('bidRows', () => {
  it('sorts newest first and keeps failed bids (tonapi /v2/dns/foundation.ton/bids)', () => {
    const rows = bidRows([
      { success: false, value: 9017000000000, txTime: 1659805511, txHash: '15acbdb7a16880b3569597f4d415215c71a5f31d55718a1234799518d9ebb319', bidder: { address: '0:d782461baf10e94590fa3d465dd23c1d8d999861077b97960e13651e5ee9cb0f', name: 'exmo.ton' } },
      { success: true, value: 10960950000000, txTime: 1659810596, txHash: 'a5717e3dbfe1d0a464044e292de3228fe7afb6b354623d9df42f078ca3c3203d', bidder: { address: '0:2fedefff62002817200b12d375d90c101ac2851ca05f69e941ce9184bae3cad6' } }
    ])
    expect(rows[0]).toMatchObject({ time: 1659810596, amount: 10960950000000n, ok: true })
    expect(rows[1]).toMatchObject({ ok: false, bidderName: 'exmo.ton' })
  })
})
