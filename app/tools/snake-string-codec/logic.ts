import type { Builder } from '@ton/core'
import { beginCell, Cell, Dictionary } from '@ton/core'
import { forEachUniqueCell } from '~/lib/boc-basics/boc'

/**
 * none: bytes only. comment: 32-bit 0 op (text comment, what wallets show). snake: TEP-64 `snake#00`.
 * chunked: TEP-64 `chunked#01` with HashmapE 32 of ^chunk cells.
 */
export type SnakeFormat = 'none' | 'comment' | 'snake' | 'chunked'

export const FORMAT_LABEL: Record<SnakeFormat, string> = {
  comment: 'Text comment (0x00000000)',
  snake: 'TEP-64 snake (0x00)',
  chunked: 'TEP-64 chunked (0x01)',
  none: 'Raw snake (no prefix)'
}

/** TVM rejects cells deeper than this, so a snake chain stops being usable on chain past ~130 KB. */
export const MAX_CELL_DEPTH = 1024

/** Bytes per chunk / per continuation cell: 1023 bits hold 127 whole bytes. */
const CELL_BYTES = 127

/** Same layout as @ton/core storeStringTail: fill the current cell, continue in ref 0. */
function writeSnake(b: Builder, bytes: Uint8Array): Builder {
  const room = Math.floor(b.availableBits / 8)
  if (bytes.length <= room) return b.storeBuffer(Buffer.from(bytes))
  return b
    .storeBuffer(Buffer.from(bytes.subarray(0, room)))
    .storeRef(writeSnake(beginCell(), bytes.subarray(room)).endCell())
}

export function encodeSnake(bytes: Uint8Array, format: SnakeFormat): Cell {
  const b = beginCell()
  if (format === 'comment') b.storeUint(0, 32)
  if (format === 'snake') b.storeUint(0, 8)
  if (format === 'chunked') {
    const dict = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
    for (let i = 0; i * CELL_BYTES < bytes.length; i++) {
      dict.set(i, beginCell().storeBuffer(Buffer.from(bytes.subarray(i * CELL_BYTES, (i + 1) * CELL_BYTES))).endCell())
    }
    return b.storeUint(1, 8).storeDict(dict).endCell()
  }
  return writeSnake(b, bytes).endCell()
}

function readSnake(cell: Cell, skipBits: number): Uint8Array {
  const parts: Buffer[] = []
  let c: Cell | null = cell
  let skip = skipBits
  while (c) {
    const s = c.beginParse()
    s.skip(skip)
    skip = 0
    if (s.remainingBits % 8) throw new Error(`A snake cell holds ${s.remainingBits} bits, which is not a whole number of bytes`)
    parts.push(s.loadBuffer(s.remainingBits / 8))
    c = s.remainingRefs ? s.loadRef() : null
  }
  return Uint8Array.from(Buffer.concat(parts))
}

/** Guesses the prefix from the first bits. */
export function detectFormat(cell: Cell): SnakeFormat {
  const s = cell.beginParse()
  if (s.remainingBits >= 32 && s.preloadUint(32) === 0) return 'comment'
  if (s.remainingBits >= 8) {
    const p = s.preloadUint(8)
    if (p === 0) return 'snake'
    if (p === 1 && s.remainingBits === 9 && s.remainingRefs <= 1) return 'chunked'
  }
  return 'none'
}

export interface Decoded {
  format: SnakeFormat
  bytes: Uint8Array
  /** UTF-8 text, or null when the bytes are not valid UTF-8. */
  text: string | null
  cells: number
}

export function decodeSnake(cell: Cell, format: SnakeFormat | 'auto' = 'auto'): Decoded {
  const f = format === 'auto' ? detectFormat(cell) : format
  let bytes: Uint8Array
  if (f === 'chunked') {
    const s = cell.beginParse()
    if (s.loadUint(8) !== 1) throw new Error('Chunked data must start with 0x01')
    const dict = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
    const keys = dict.keys().sort((a, b) => a - b)
    bytes = Uint8Array.from(Buffer.concat(keys.map(k => Buffer.from(readSnake(dict.get(k)!, 0)))))
  }
  else {
    bytes = readSnake(cell, f === 'comment' ? 32 : f === 'snake' ? 8 : 0)
  }
  let text: string | null
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    text = null
  }
  let cells = 0
  forEachUniqueCell([cell], () => cells++)
  return { format: f, bytes, text, cells }
}

/** Parses hex bytes ("de ad be ef", "0xdeadbeef"). */
export function parseHexBytes(input: string): Uint8Array {
  const s = input.replace(/\s+/g, '').replace(/^0x/i, '')
  if (!/^([0-9a-f]{2})*$/i.test(s)) throw new Error('Hex must be pairs of 0-9 / a-f characters')
  return Uint8Array.from(Buffer.from(s, 'hex'))
}
