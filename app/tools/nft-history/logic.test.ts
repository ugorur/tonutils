import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TcMetadata } from '~/lib/nfts-read/core'
import fixture from './fixture.json'
import type { TcAction } from './logic'
import { ACTIONS_PATH, csvRows, fetchTrust, NFT_ACTION_TYPES, toRow } from './logic'

// toncenter GET /api/v3/actions (2026-10-22, trimmed):
//  item:   account=0:ecb48c17…e5e8 (TON Diamonds "Diamond #12"), NFT action types only, newest first.
//  wallet: account=0:1a1c93fc…9fca with every NFT action_type, one sample per (type, received?) pair.
const item = fixture.item as unknown as { actions: TcAction[], metadata: TcMetadata }
const wallet = fixture.wallet.actions as unknown as TcAction[]
const ME = '0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca'

describe('item provenance', () => {
  const rows = item.actions.map(a => toRow(a, item.metadata))

  it('starts with the mint and ends with the listing transfer', () => {
    expect(rows).toHaveLength(17)
    expect(rows.at(-1)).toMatchObject({ type: 'nft_mint', label: 'Minted', to: '0:06d811f426598591b32b2c49f29f66c821368e4acb1de16762b04e0174532465', time: 1655117198 })
    expect(rows[0]).toMatchObject({
      label: 'Transferred',
      from: ME,
      to: '0:ec44c0ee29deb39d39b4cffc52be0b455685b1db1a3a065b219bee8328d85148',
      itemName: 'Diamond #12',
      // The seller's wallet transaction that started it: toncenter /api/v3/nft/transfers reports
      // trace_id vqQzVjkz… for this transfer (the NFT's own transaction is Lc9Rqgk…).
      tx: 'vqQzVjkzIgZQ2fFk4XHcrbha23/y8Hgz5Zi0zZzS8jk='
    })
  })

  it('reads the sale price and the real seller', () => {
    const sale = rows.find(r => r.type === 'nft_purchase')!
    expect(sale).toMatchObject({
      label: 'Sold',
      price: 900000000000n,
      priceLabel: 'Price',
      from: '0:cadb2e56b14091d05d003f4b8cfe5279d5abc6285a8beed03f1101a079fae13d',
      to: ME,
      marketplace: '0:584ee61b2dff0837116d0fcb5078d93964bcbe9c05fd6a141b1bfca5d6a43e18'
    })
    expect(rows.filter(r => r.type === 'auction_bid').map(r => r.price)).toEqual([900000000000n, 200000000000n])
  })
})

describe('wallet activity', () => {
  const rows = wallet.map(a => toRow(a, undefined, ME))
  const by = (type: string, dir?: string) => rows.find(r => r.type === type && (!dir || r.direction === dir))!

  it('labels from the wallet point of view', () => {
    expect(by('nft_transfer', 'out')).toMatchObject({ label: 'Sent', from: ME })
    expect(by('nft_transfer', 'in')).toMatchObject({ label: 'Received', to: ME })
    expect(by('nft_purchase', 'out')).toMatchObject({ label: 'Sold', price: 58000000000n })
    expect(by('nft_purchase', 'in')).toMatchObject({ label: 'Bought', price: 900000000000n })
    expect(by('nft_put_on_sale')).toMatchObject({ label: 'Listed for sale', price: 58000000000n, priceLabel: 'Asking price', direction: 'out' })
    expect(by('dns_purchase')).toMatchObject({ label: 'Domain bought', price: 39942687838n, direction: 'in' })
    expect(by('teleitem_start_auction')).toMatchObject({ price: 38000000000n, priceLabel: 'Minimum bid' })
    expect(by('auction_outbid')).toMatchObject({ label: 'Outbid (refunded)', price: 11000000000n, direction: 'in' })
    expect(by('auction_bid')).toMatchObject({ label: 'Bid', price: 11000000000n, direction: 'out' })
  })

  it('exports CSV with exact GRAM amounts', () => {
    const csv = csvRows([by('dns_purchase')], r => r ?? '')
    expect(csv[0]).toMatchObject({ event: 'Domain bought', amount_GRAM: '39.942687838', amount_type: 'Price', time_utc: '2023-04-05T13:14:52.000Z' })
  })
})

describe('ACTIONS_PATH', () => {
  it('lists every NFT action type as its own parameter', () => {
    expect(NFT_ACTION_TYPES).toHaveLength(16)
    expect(ACTIONS_PATH.startsWith('actions?action_type=nft_mint&action_type=nft_transfer&')).toBe(true)
    expect(ACTIONS_PATH.split('&')).toHaveLength(16)
  })
})

describe('wallet edge cases', () => {
  it('does not call an old_owner = new_owner transfer "Received"', () => {
    // toncenter /api/v3/actions?account=0:1a1c93fc…9fca&action_type=nft_transfer (2026-10-23): a spam NFT
    // whose transfer reports this wallet as both old and new owner.
    const a: TcAction = {
      trace_id: 'spucXh3V/DEsgl2mcTubzkYAxnR/JT8Ie0gfHUicDak=', action_id: 'B0qoqKr2E8K7NoCIclqLaGheRNoHx1vLrYrfN9RMf3U=', start_utime: 1719503597,
      transactions: ['NBXvA0I3+HgLkjxr6WHubDnaLxyzXpFR4b/g0G1G3Is='], success: true, type: 'nft_transfer',
      details: { nft_item: '0:9ED46F319927C63E2136962727C43EE4250D39565FF6AD6BF995789F5C6C34AE', old_owner: ME.toUpperCase(), new_owner: ME.toUpperCase(), real_old_owner: null }
    }
    expect(toRow(a, undefined, ME)).toMatchObject({ label: 'Sent to itself', direction: undefined, from: ME, to: ME })
  })
})

describe('fetchTrust', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('maps tonapi /v2/nfts/_bulk trust by lowercase raw address', async () => {
    // Response values from tonapi POST /v2/nfts/_bulk (2026-10-23): the "you won 100 ton" NFT is blacklisted,
    // Diamond #12 whitelisted.
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).account_ids).toHaveLength(2)
      return new Response(JSON.stringify({ nft_items: [
        { address: '0:987498af095ca8b13780f2092626224f7c02aa9af2b0c8194b5ba43c91e3302d', trust: 'blacklist' },
        { address: '0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8', trust: 'whitelist' }
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const m = await fetchTrust('https://tonapi.io/v2', [
      '0:987498af095ca8b13780f2092626224f7c02aa9af2b0c8194b5ba43c91e3302d',
      '0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8',
      '0:987498af095ca8b13780f2092626224f7c02aa9af2b0c8194b5ba43c91e3302d'
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://tonapi.io/v2/nfts/_bulk')
    expect(m.get('0:987498af095ca8b13780f2092626224f7c02aa9af2b0c8194b5ba43c91e3302d')).toBe('blacklist')
    expect(m.get('0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8')).toBe('whitelist')
  })
})
