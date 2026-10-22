import { describe, expect, it } from 'vitest'
import { explorerLinks, explorerUrl, txHashHex } from './explorers'

// Each URL below was opened (HTTP 200) on 2026-10-22.
const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const TX_B64 = 'f0D63g09itqtva7SF2wGjTY3aMZ6+4gRXRTdFRSf8Zw='
const TX_HEX = '7f40fade0d3d8adaadbdaed2176c068d363768c67afb88115d14dd15149ff19c'

describe('explorers', () => {
  it('builds address links', () => {
    expect(explorerLinks('address', USDT).map(l => l.url)).toEqual([
      `https://tonviewer.com/${USDT}`,
      `https://tonscan.org/address/${USDT}`,
      `https://tonscan.com/${USDT}`
    ])
  })

  it('normalizes tx hashes to hex', () => {
    expect(txHashHex(TX_B64)).toBe(TX_HEX)
    expect(txHashHex(TX_B64.replace(/\+/g, '-').replace(/\//g, '_'))).toBe(TX_HEX)
    expect(explorerUrl('tonviewer', 'tx', TX_B64)).toBe(`https://tonviewer.com/transaction/${TX_HEX}`)
    expect(explorerUrl('tonscan-com', 'tx', TX_HEX)).toBe(`https://tonscan.com/transactions/${TX_HEX}`)
  })

  it('uses testnet hosts and skips explorers without testnet', () => {
    const links = explorerLinks('address', USDT, 'testnet')
    expect(links.map(l => l.id)).toEqual(['tonviewer', 'tonscan'])
    expect(links[0]!.url).toBe(`https://testnet.tonviewer.com/${USDT}`)
  })

  it('links NFTs to getgems first', () => {
    expect(explorerLinks('nft', USDT)[0]).toMatchObject({ id: 'getgems', url: `https://getgems.io/nft/${USDT}` })
    expect(explorerUrl('getgems', 'tx', TX_HEX)).toBeNull()
  })
})
