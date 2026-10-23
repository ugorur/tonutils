import { describe, expect, it } from 'vitest'
import { Cell } from '@ton/core'
import { COMMENT_BODY_BOC, COMMENT_BODY_HASH_B64, PROOF_BOC_HEX, TX1_BOC, TX1_HASH_B64 } from '~/lib/boc-basics/vectors'
import { decodeBocText } from '~/lib/boc-basics/boc'
import { inspectBoc, reencode } from './logic'

const b64ToHex = (s: string) => Buffer.from(s, 'base64').toString('hex')

describe('inspectBoc', () => {
  it('reads a real mainnet transaction BOC (toncenter) and matches its hash', () => {
    const r = inspectBoc(TX1_BOC)
    expect(r.format).toBe('base64')
    expect(r.rootHashes).toEqual([b64ToHex(TX1_HASH_B64)])
    // te6cckEC DA EA AlQ…: flags 0x41 (CRC32C, 1-byte refs), 2-byte offsets, 12 cells, 1 root, 596 bytes of cells
    expect(r.header).toMatchObject({ hasIndex: false, hasCrc32c: true, hasCacheBits: false, refBytes: 1, offsetBytes: 2, cells: 12, roots: 1, absent: 0, totalCellsSize: 596 })
    expect(r.stats.cells).toBe(12)
    expect(r.sizeBytes).toBe(Buffer.from(TX1_BOC, 'base64').length)
  })

  it('accepts the same BOC as hex, 0x-hex and base64url, with whitespace', () => {
    const hex = b64ToHex(TX1_BOC)
    const url = TX1_BOC.replace(/\+/g, '-').replace(/\//g, '_')
    expect(inspectBoc(hex).format).toBe('hex')
    expect(inspectBoc(`0x${hex.toUpperCase()}`).rootHashes[0]).toBe(b64ToHex(TX1_HASH_B64))
    expect(inspectBoc(url.match(/.{1,40}/g)!.join('\n')).rootHashes[0]).toBe(b64ToHex(TX1_HASH_B64))
    expect(decodeBocText(url).format).toBe(url === TX1_BOC ? 'base64' : 'base64url')
  })

  it('reads a multi-root BOC (tonapi liteserver proof, 2 roots, 77 cells)', () => {
    const r = inspectBoc(PROOF_BOC_HEX)
    expect(r.header.roots).toBe(2)
    expect(r.roots).toHaveLength(2)
    expect(r.header.cells).toBe(77)
    expect(r.stats.exotic).toBeGreaterThan(0)
  })

  it.each([
    ['', /Paste a BOC/],
    ['not a boc!', /Not base64 or hex/],
    ['AAAAAAAAAAAA', /unknown magic/]
  ])('rejects %j', (input, msg) => {
    expect(() => inspectBoc(input)).toThrow(msg)
  })

  it('detects a corrupted CRC32C', () => {
    const bytes = Buffer.from(COMMENT_BODY_BOC, 'base64')
    bytes[20] = bytes[20]! ^ 1
    expect(() => inspectBoc(bytes.toString('base64'))).toThrow(/Invalid BOC/)
  })
})

describe('reencode', () => {
  const body = Cell.fromBase64(COMMENT_BODY_BOC)

  it('reproduces toncenter\'s te6cck serialization byte for byte for a 2-cell body (CRC32C, no index)', () => {
    expect(body.hash().toString('base64')).toBe(COMMENT_BODY_HASH_B64)
    expect(reencode(body, { idx: false, crc32: true }).base64).toBe(COMMENT_BODY_BOC)
    // Bigger trees keep the hash, but @ton/core may order cells differently than the node did.
    const tx = reencode(Cell.fromBase64(TX1_BOC), { idx: false, crc32: true })
    expect(inspectBoc(tx.base64).rootHashes[0]).toBe(b64ToHex(TX1_HASH_B64))
  })

  it('sets the header flags it was asked for and keeps the hash', () => {
    for (const idx of [false, true]) {
      for (const crc32 of [false, true]) {
        const e = reencode(body, { idx, crc32 })
        const r = inspectBoc(e.hex)
        expect(r.header).toMatchObject({ hasIndex: idx, hasCrc32c: crc32 })
        expect(r.rootHashes[0]).toBe(body.hash().toString('hex'))
        expect(inspectBoc(e.base64url).rootHashes[0]).toBe(r.rootHashes[0])
        expect(e.bytes.length).toBe(e.hex.length / 2)
      }
    }
  })
})
