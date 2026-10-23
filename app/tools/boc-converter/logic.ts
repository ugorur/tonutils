import type { Cell } from '@ton/core'
import type { BocHeader, BocTextFormat, EncodedBoc, TreeStats } from '~/lib/boc-basics/boc'
import { decodeBocText, encodeBoc, parseRoots, readBocHeader, treeStats } from '~/lib/boc-basics/boc'

export interface BocReport {
  format: BocTextFormat
  sizeBytes: number
  header: BocHeader
  roots: Cell[]
  /** Representation hash of each root, hex. */
  rootHashes: string[]
  stats: TreeStats
}

/** Parses BOC text and describes it. Throws a readable Error. */
export function inspectBoc(input: string): BocReport {
  const { bytes, format } = decodeBocText(input)
  const header = readBocHeader(bytes)
  const roots = parseRoots(bytes)
  return {
    format,
    sizeBytes: bytes.length,
    header,
    roots,
    rootHashes: roots.map(r => r.hash().toString('hex')),
    stats: treeStats(roots)
  }
}

/** Re-serializes one root. Defaults match what wallets and toncenter produce (te6cck…: CRC32C, no index). */
export function reencode(root: Cell, opts: { idx: boolean, crc32: boolean }): EncodedBoc {
  return encodeBoc(root, opts)
}
