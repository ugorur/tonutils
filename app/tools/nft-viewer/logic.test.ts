import { describe, expect, it } from 'vitest'
import type { TonapiNftItem } from '~/lib/nfts-read/core'
import { parseNftQuery } from '~/lib/nfts-read/core'
import { nftView, parseRoyalty, royaltyOn, salePrice } from './logic'

// tonapi GET /v2/nfts/0:ecb48c17…e5e8 (TON Diamonds "Diamond #12", listed on Getgems), 2026-10-22, previews trimmed.
const DIAMOND: TonapiNftItem = {
  address: '0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8',
  index: 11,
  owner: { address: '0:ec44c0ee29deb39d39b4cffc52be0b455685b1db1a3a065b219bee8328d85148', is_scam: false, is_wallet: false },
  collection: { address: '0:06d811f426598591b32b2c49f29f66c821368e4acb1de16762b04e0174532465', name: 'TON Diamonds' },
  verified: true,
  metadata: {
    description: 'A medium flamingo heart-shaped diamond on a matrix background. This is a posh cut diamond with a dual green glow and no glints.',
    lottie: 'https://nft.ton.diamonds/nft/11/11.lottie.json',
    animation_url: 'https://nft.ton.diamonds/nft/11/11.mp4',
    image: 'https://nft.ton.diamonds/nft/11/11.svg',
    attributes: [
      { trait_type: 'Size', value: 'Medium' }, { trait_type: 'Shape', value: 'Heart' }, { trait_type: 'Color', value: 'Flamingo' },
      { trait_type: 'Cut', value: 'Posh' }, { trait_type: 'Glow', value: 'Dual Green' }, { trait_type: 'Background', value: 'Matrix' },
      { trait_type: 'Shine', value: 'None' }
    ],
    id: 11,
    name: 'Diamond #12'
  },
  sale: {
    address: '0:ec44c0ee29deb39d39b4cffc52be0b455685b1db1a3a065b219bee8328d85148',
    market: { address: '0:584ee61b2dff0837116d0fcb5078d93964bcbe9c05fd6a141b1bfca5d6a43e18', name: 'Getgems Sales', is_scam: false, is_wallet: false },
    owner: { address: '0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca', is_scam: false, is_wallet: true },
    price: { currency_type: 'native', value: '1275000000000', decimals: 9, token_name: 'Gram' }
  },
  previews: [
    { resolution: '100x100', url: 'https://cache.tonapi.io/imgproxy/eN-OqEFigyl4GQg_T9IBKOcaNN298CxXC6J715smWdY/rs:fill:100:100:1/g:no/aHR0cHM6Ly9uZnQudG9uLmRpYW1vbmRzL25mdC8xMS8xMS5zdmc.webp' },
    { resolution: '500x500', url: 'https://cache.tonapi.io/imgproxy/pytZNU9cpWObgzKVN1TZY6gpwhkNllVlNFP27pAKHmc/rs:fill:500:500:1/g:no/aHR0cHM6Ly9uZnQudG9uLmRpYW1vbmRzL25mdC8xMS8xMS5zdmc.webp' }
  ],
  approved_by: ['getgems'],
  trust: 'whitelist'
}

// tonapi GET /v2/nfts/0:adacd5f9…ef5e (Hack-a-TONx participant SBT), 2026-10-22. toncenter
// /api/v3/nft/items?address=… lists its interfaces as ["nft_item", "sbt"].
const SBT: TonapiNftItem = {
  address: '0:adacd5f9e560c11dc211f18bf919e61b28af7e6797c73c7fc6bf93514413ef5e',
  index: 25,
  owner: { address: '0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca', is_scam: false, is_wallet: true },
  collection: { address: '0:549aa0b97cad1b83adadc4b844c9316be3fd33c5ddf07024a91a8753497e1ca3', name: 'Hack-a-TONx: DeFi & Data Analytics Participants' },
  verified: true,
  metadata: {
    content_url: 'https://sbt-bot-minter.s3.amazonaws.com/Hack-a-TONx%3A%20DeFi%20%26%20Data%20Analytics%20Participants/itemImage.mp4',
    description: 'Reward for contribution',
    content_type: 'video/mp4',
    name: 'Hack-a-TONx: DeFi & Data Analytics Participant',
    image: 'https://sbt-bot-minter.s3.amazonaws.com/Hack-a-TONx%3A%20DeFi%20%26%20Data%20Analytics%20Participants/logo.jpg'
  },
  approved_by: [],
  trust: 'graylist'
}

describe('parseRoyalty', () => {
  it('decodes TON Diamonds royalty_params', () => {
    // toncenter POST /api/v3/runGetMethod royalty_params on EQAG2BH0…Zbir (2026-10-22). Expected values:
    // tonapi /v2/blockchain/accounts/…/methods/royalty_params "decoded" (numerator 22, denominator 1000).
    const r = parseRoyalty([
      { type: 'num', value: '0x16' },
      { type: 'num', value: '0x3e8' },
      { type: 'cell', value: 'te6cckEBAQEAJAAAQ4ARKckLuq22GdsiptP7thQNN+yRFCi1BGWZHcyFbaVcf5B/CukY' }
    ])
    expect(r).toEqual({ numerator: 22, denominator: 1000, percent: 2.2, destination: '0:894e485dd56db0ced915369fddb0a069bf6488a145a8232cc8ee642b6d2ae3fc' })
    // 2.2 % of the 1275 GRAM listing price
    expect(royaltyOn(1275000000000n, r)).toBe(28050000000n)
  })

  it('rounds the percent for display (hand-computed 1/3 = 33.3333 %)', () => {
    const dest = 'te6cckEBAQEAJAAAQ4ARKckLuq22GdsiptP7thQNN+yRFCi1BGWZHcyFbaVcf5B/CukY'
    expect(parseRoyalty([{ type: 'num', value: '0x1' }, { type: 'num', value: '0x3' }, { type: 'cell', value: dest }]).percent).toBe(33.3333)
  })

  it('rejects a non-royalty stack', () => {
    expect(() => parseRoyalty([{ type: 'num', value: '0x14b18' }])).toThrow(/royalty_params/)
  })
})

describe('nftView', () => {
  it('shows the seller as owner of a listed item', () => {
    const v = nftView(DIAMOND, ['nft_item_simple'])
    expect(v).toMatchObject({
      name: 'Diamond #12',
      owner: { raw: '0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca' },
      holder: '0:ec44c0ee29deb39d39b4cffc52be0b455685b1db1a3a065b219bee8328d85148',
      sale: { market: 'Getgems Sales', price: { units: 1275000000000n, decimals: 9, symbol: 'GRAM' } },
      collection: { name: 'TON Diamonds' },
      media: 'https://nft.ton.diamonds/nft/11/11.mp4',
      kind: 'other',
      isSbt: false,
      trust: 'whitelist'
    })
    expect(v.attributes).toHaveLength(7)
    expect(v.attributes[4]).toEqual({ trait: 'Glow', value: 'Dual Green' })
    // No 1500px preview in the trimmed fixture: falls back to the original image.
    expect(v.image).toBe('https://nft.ton.diamonds/nft/11/11.svg')
  })

  it('flags soulbound tokens and video content', () => {
    const v = nftView(SBT, ['nft_item', 'sbt'])
    expect(v.isSbt).toBe(true)
    expect(v.sale).toBeUndefined()
    expect(v.owner?.raw).toBe('0:1a1c93fc5135e77034f7130004483d2622032842f2653ca4fd90f8d3adff9fca')
    expect(v.media).toMatch(/itemImage\.mp4$/)
    expect(v.attributes).toEqual([])
  })

  it('names jetton-priced sales by token', () => {
    expect(salePrice({ ...DIAMOND.sale!, price: { currency_type: 'jetton', value: '5000000', decimals: 6, token_name: 'USD₮' } }))
      .toEqual({ units: 5000000n, decimals: 6, symbol: 'USD₮' })
  })
})

describe('parseNftQuery', () => {
  it('takes the item from getgems and explorer links', () => {
    const item = '0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8'
    // EQDstIwX…6JrH is the friendly form toncenter's address_book gives for this item.
    expect(parseNftQuery('EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH')).toEqual({ kind: 'address', raw: item })
    expect(parseNftQuery('https://getgems.io/collection/EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir/EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH')).toEqual({ kind: 'address', raw: item })
    expect(parseNftQuery(`https://tonviewer.com/${item}`)).toEqual({ kind: 'address', raw: item })
    expect(parseNftQuery('foundation.ton')).toMatchObject({ kind: 'invalid' })
    expect(parseNftQuery('foundation.ton', { allowNames: true })).toEqual({ kind: 'domain', name: 'foundation.ton' })
    expect(parseNftQuery('  ')).toEqual({ kind: 'empty' })
  })
})
