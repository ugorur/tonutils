import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { beginCell, Cell, comment, Dictionary } from '@ton/core'
import { COMMENT_BODY_BOC, COMMENT_BODY_HASH_B64, COMMENT_TEXT, VODKA_CONTENT_HEX, VODKA_DESC_BOC, VODKA_META } from '~/lib/boc-basics/vectors'
import { decodeSnake, detectFormat, encodeSnake, MAX_CELL_DEPTH, parseHexBytes } from './logic'

const utf8 = (s: string) => new TextEncoder().encode(s)

/** Value cell of an on-chain TEP-64 content dict (key = sha256(name)). */
function onchainValue(key: string): Cell {
  const s = Cell.fromHex(VODKA_CONTENT_HEX).beginParse()
  expect(s.loadUint(8)).toBe(0) // onchain#00
  const dict = s.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
  return dict.get(createHash('sha256').update(key).digest())!
}

describe('text comments (real mainnet message, toncenter)', () => {
  it('decodes a 2-cell comment with UTF-8 split across cells', () => {
    const d = decodeSnake(Cell.fromBase64(COMMENT_BODY_BOC))
    expect(d).toMatchObject({ format: 'comment', text: COMMENT_TEXT, cells: 2 })
  })

  it('encodes the same text into the exact same cell (same hash as on chain)', () => {
    const c = encodeSnake(utf8(COMMENT_TEXT), 'comment')
    expect(c.hash().toString('base64')).toBe(COMMENT_BODY_HASH_B64)
    expect(c.equals(comment(COMMENT_TEXT))).toBe(true)
  })
})

describe('TEP-64 snake values (real on-chain jetton metadata, tonapi + toncenter)', () => {
  it.each(['name', 'symbol', 'description', 'image', 'decimals'] as const)('decodes %s', (key) => {
    const d = decodeSnake(onchainValue(key))
    expect(d.format).toBe('snake')
    expect(d.text).toBe(VODKA_META[key])
  })

  it('re-encodes the 2-cell description into the identical on-chain cell', () => {
    const onchain = onchainValue('description')
    const c = encodeSnake(utf8(VODKA_META.description), 'snake')
    expect(decodeSnake(onchain).cells).toBe(2)
    expect(Cell.fromBase64(VODKA_DESC_BOC).equals(onchain)).toBe(true)
    expect(c.hash().equals(onchain.hash())).toBe(true)
  })
})

describe('chunked and raw', () => {
  const long = 'x'.repeat(300) + 'ž'

  it('chunked: 0x01 + dict of 127-byte chunks, round trips', () => {
    const c = encodeSnake(utf8(long), 'chunked')
    const s = c.beginParse()
    expect(s.loadUint(8)).toBe(1)
    const dict = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
    expect(dict.keys().sort()).toEqual([0, 1, 2])
    expect(dict.get(0)!.bits.length).toBe(127 * 8)
    expect(dict.get(2)!.bits.length).toBe((302 - 254) * 8)
    expect(detectFormat(c)).toBe('chunked')
    expect(decodeSnake(c).text).toBe(long)
  })

  it('raw snake fills 127 bytes per cell', () => {
    const c = encodeSnake(utf8(long), 'none')
    expect(c.bits.length).toBe(1016)
    const d = decodeSnake(c, 'none')
    expect(d).toMatchObject({ text: long, cells: 3 })
  })

  it('a snake chain past 1024 cells is too deep for TVM, chunked stays shallow', () => {
    const big = new Uint8Array(127 * (MAX_CELL_DEPTH + 1))
    expect(encodeSnake(big, 'none').depth()).toBe(MAX_CELL_DEPTH)
    expect(encodeSnake(new Uint8Array(127 * (MAX_CELL_DEPTH + 2)), 'none').depth()).toBeGreaterThan(MAX_CELL_DEPTH)
    expect(encodeSnake(big, 'chunked').depth()).toBeLessThan(20)
  })

  it('returns null text for non-UTF-8 bytes and keeps the bytes', () => {
    const d = decodeSnake(encodeSnake(parseHexBytes('ff fe 00 01'), 'snake'))
    expect(d.text).toBeNull()
    expect(Buffer.from(d.bytes).toString('hex')).toBe('fffe0001')
  })

  it('rejects cells that are not byte aligned and bad hex', () => {
    expect(() => decodeSnake(beginCell().storeUint(5, 3).endCell(), 'none')).toThrow(/whole number of bytes/)
    expect(() => parseHexBytes('abc')).toThrow()
  })
})
