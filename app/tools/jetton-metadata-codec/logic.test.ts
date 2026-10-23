import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import {
  HMSTR_CONTENT, HMSTR_EXPECTED, STGRAM_CONTENT, STGRAM_EXPECTED, STON_CONTENT, STON_EXPECTED_URI,
  TSTON_CONTENT, TSTON_EXPECTED, USDT_CONTENT, USDT_EXPECTED, DIAMOND_NFT_CONTENT, DIAMOND_NFT_URI
} from '~/lib/jettons-dev/fixtures'
import { decodeContent, encodeContent, EXAMPLE_JSON, mergeMetadata } from './logic'

// Content cells: get_jetton_data on mainnet (toncenter v2 runGetMethod). Expected JSON: toncenter v3 jetton/masters
// `jetton_content` for the same masters (an independent TEP-64 decoder), 2026-10-22.
const cell = (b64: string) => Cell.fromBase64(b64)

describe('decodeContent (mainnet jetton masters)', () => {
  it('USD₮: semi-chain (on-chain decimals + uri)', () => {
    const d = decodeContent(cell(USDT_CONTENT))
    expect(d.layout).toBe('semichain')
    expect(d.json).toEqual(USDT_EXPECTED)
    expect(d.uri).toBe(USDT_EXPECTED.uri)
  })

  it('STON: off-chain (0x01 + URI)', () => {
    const d = decodeContent(cell(STON_CONTENT))
    expect(d.layout).toBe('offchain')
    expect(d.uri).toBe(STON_EXPECTED_URI)
  })

  it('tsTON: semi-chain with name/symbol on chain', () => {
    expect(decodeContent(cell(TSTON_CONTENT)).json).toEqual(TSTON_EXPECTED)
  })

  it('stGRAM: fully on-chain', () => {
    const d = decodeContent(cell(STGRAM_CONTENT))
    expect(d.layout).toBe('onchain')
    expect(d.json).toEqual(STGRAM_EXPECTED)
    expect(d.entries.every(e => e.format === 'snake' && e.key)).toBe(true)
  })

  it('HMSTR: uri stored as 0x00 with the text in a ref (snake-ref)', () => {
    const d = decodeContent(cell(HMSTR_CONTENT))
    expect(d.json).toEqual(HMSTR_EXPECTED)
    expect(d.entries[0]!.format).toBe('snake-ref')
  })

  it('NFT full content (TON Diamonds get_nft_content): prefix + ref suffix joins into one URI', () => {
    expect(decodeContent(cell(DIAMOND_NFT_CONTENT)).uri).toBe(DIAMOND_NFT_URI)
  })

  it('rejects bad prefixes and empty cells with readable errors', () => {
    expect(() => decodeContent(Cell.EMPTY)).toThrow(/empty/)
    expect(() => decodeContent(Cell.fromBase64(USDT_CONTENT).refs[0]!.refs[0]!)).toThrow(/Unknown content prefix 0xbf/)
  })
})

describe('encodeContent', () => {
  it('re-encoding stGRAM\'s decoded JSON reproduces the on-chain cell bit for bit', () => {
    const { cell: c } = encodeContent({ layout: 'onchain', json: JSON.stringify(STGRAM_EXPECTED), uri: '', format: 'snake' })
    expect(c.hash().toString('hex')).toBe(cell(STGRAM_CONTENT).hash().toString('hex'))
  })

  it('re-encoding tsTON (semi-chain) reproduces the on-chain cell', () => {
    const { uri, ...rest } = TSTON_EXPECTED
    const ts = encodeContent({ layout: 'semichain', json: JSON.stringify(rest), uri, format: 'snake' })
    expect(ts.cell.equals(cell(TSTON_CONTENT))).toBe(true)
    // USD₮ mixes layouts per value (decimals inline, uri in a ref), so one global format cannot reproduce it:
    const us = decodeContent(cell(USDT_CONTENT)).entries.map(e => [e.key, e.format])
    expect(us).toEqual([['decimals', 'snake'], ['uri', 'snake-ref']])
  })

  it('re-encoding STON (off-chain) and HMSTR (snake-ref) reproduces the on-chain cells', () => {
    expect(encodeContent({ layout: 'offchain', json: '', uri: STON_EXPECTED_URI, format: 'snake' }).cell.equals(cell(STON_CONTENT))).toBe(true)
    expect(encodeContent({ layout: 'onchain', json: JSON.stringify(HMSTR_EXPECTED), uri: '', format: 'snake-ref' }).cell.equals(cell(HMSTR_CONTENT))).toBe(true)
  })

  it('chunked values (0x01 + HashmapE 32) decode back', () => {
    const { cell: c } = encodeContent({ layout: 'onchain', json: JSON.stringify({ description: 'x'.repeat(300) }), uri: '', format: 'chunked' })
    const d = decodeContent(c)
    expect(d.entries[0]!.format).toBe('chunked')
    expect(d.json.description).toBe('x'.repeat(300))
  })

  it('numbers become strings, objects warn, image_data round-trips as base64', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')
    const { cell: c, warnings } = encodeContent({ layout: 'onchain', json: JSON.stringify({ name: 'X', decimals: 6, social: ['https://t.me/x'], image_data: png }), uri: '', format: 'snake' })
    const d = decodeContent(c)
    expect(d.json).toMatchObject({ name: 'X', decimals: '6', social: '["https://t.me/x"]', image_data: png })
    expect(warnings.some(w => w.includes('social'))).toBe(true)
  })

  it('long values split across cells and decode back', () => {
    const description = 'GRAM '.repeat(200)
    const { cell: c } = encodeContent({ layout: 'onchain', json: JSON.stringify({ description }), uri: '', format: 'snake' })
    expect(decodeContent(c).json.description).toBe(description)
  })

  it('errors: invalid JSON, empty object, offchain without URI', () => {
    expect(() => encodeContent({ layout: 'onchain', json: '{', uri: '', format: 'snake' })).toThrow(/Invalid JSON/)
    expect(() => encodeContent({ layout: 'onchain', json: '{}', uri: '', format: 'snake' })).toThrow(/at least one/)
    expect(() => encodeContent({ layout: 'offchain', json: '', uri: ' ', format: 'snake' })).toThrow(/URI/)
  })

  it('the example JSON is valid', () => {
    expect(() => encodeContent({ layout: 'onchain', json: EXAMPLE_JSON, uri: '', format: 'snake' })).not.toThrow()
  })
})

describe('mergeMetadata', () => {
  it('on-chain keys override the off-chain JSON (TEP-64)', () => {
    // tether.to/usdt-ton.json fetched 2026-10-22 (decimals "6" there too)
    const off = { name: 'Tether USD', symbol: 'USD₮', decimals: '6', image: 'https://tether.to/images/logoCircle.png' }
    expect(mergeMetadata({ decimals: '9', uri: 'x' }, off)).toEqual({ ...off, decimals: '9' })
  })
})
