// BOC text/bytes helpers shared by the boc-basics tools (boc-converter, cell-tree-viewer, message-hash-tool,
// snake-string-codec). Pure TS; imports @ton/core, so client/logic only.
import { Cell } from '@ton/core'

export type BocTextFormat = 'hex' | 'base64' | 'base64url'

const MAGICS: Record<string, string> = {
  b5ee9c72: 'generic (b5ee9c72)',
  '68ff65f3': 'legacy with index (68ff65f3)',
  acc3a728: 'legacy with index + CRC32C (acc3a728)'
}

/** Decodes BOC text (hex with optional 0x, base64 or base64url; whitespace ignored) into bytes. */
export function decodeBocText(input: string): { bytes: Uint8Array, format: BocTextFormat } {
  const s = input.replace(/\s+/g, '').replace(/^0x/i, '')
  if (!s) throw new Error('Paste a BOC (base64 or hex)')
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0 && MAGICS[s.slice(0, 8).toLowerCase()]) {
    return { bytes: Uint8Array.from(Buffer.from(s, 'hex')), format: 'hex' }
  }
  if (!/^[A-Za-z0-9+/\-_]+={0,2}$/.test(s)) throw new Error('Not base64 or hex. A BOC looks like te6cc… (base64) or b5ee9c72… (hex).')
  const url = /[-_]/.test(s)
  return { bytes: Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), format: url ? 'base64url' : 'base64' }
}

export interface BocHeader {
  magic: string
  hasIndex: boolean
  hasCrc32c: boolean
  hasCacheBits: boolean
  /** Bytes per cell reference (size field). */
  refBytes: number
  offsetBytes: number
  cells: number
  roots: number
  absent: number
  totalCellsSize: number
}

/** Reads the BOC header fields (serialized_boc in TON's boc.tlb). */
export function readBocHeader(bytes: Uint8Array): BocHeader {
  if (bytes.length < 6) throw new Error('Too short to be a BOC')
  const magic = Buffer.from(bytes.subarray(0, 4)).toString('hex')
  if (!MAGICS[magic]) throw new Error(`Not a BOC: unknown magic ${magic}`)
  const generic = magic === 'b5ee9c72'
  const b4 = bytes[4]!
  const refBytes = generic ? b4 & 7 : b4
  const offsetBytes = bytes[5]!
  let p = 6
  const num = (n: number) => {
    if (p + n > bytes.length) throw new Error('BOC header is truncated')
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + bytes[p++]!
    return v
  }
  const cells = num(refBytes)
  const roots = num(refBytes)
  const absent = num(refBytes)
  const totalCellsSize = num(offsetBytes)
  return {
    magic: MAGICS[magic]!,
    hasIndex: generic ? !!(b4 & 0x80) : true,
    hasCrc32c: generic ? !!(b4 & 0x40) : magic === 'acc3a728',
    hasCacheBits: generic ? !!(b4 & 0x20) : false,
    refBytes,
    offsetBytes,
    cells,
    roots,
    absent,
    totalCellsSize
  }
}

/** All root cells of a BOC (text or bytes). Throws a readable Error. */
export function parseRoots(input: string | Uint8Array): Cell[] {
  const bytes = typeof input === 'string' ? decodeBocText(input).bytes : input
  readBocHeader(bytes)
  try {
    return Cell.fromBoc(Buffer.from(bytes))
  }
  catch (e) {
    throw new Error(`Invalid BOC: ${(e as Error).message}`)
  }
}

export interface TreeStats {
  /** Distinct cells (by hash). */
  cells: number
  bits: number
  refs: number
  exotic: number
  depth: number
}

/** Visits every distinct cell (deduplicated by representation hash). */
export function forEachUniqueCell(roots: Cell[], fn: (c: Cell) => void): void {
  const seen = new Set<string>()
  const stack = [...roots]
  while (stack.length) {
    const c = stack.pop()!
    const h = c.hash().toString('hex')
    if (seen.has(h)) continue
    seen.add(h)
    fn(c)
    stack.push(...c.refs)
  }
}

export function treeStats(roots: Cell[]): TreeStats {
  const s: TreeStats = { cells: 0, bits: 0, refs: 0, exotic: 0, depth: Math.max(0, ...roots.map(r => r.depth())) }
  forEachUniqueCell(roots, (c) => {
    s.cells++
    s.bits += c.bits.length
    s.refs += c.refs.length
    if (c.isExotic) s.exotic++
  })
  return s
}

export interface EncodedBoc {
  bytes: Uint8Array
  base64: string
  base64url: string
  hex: string
}

export function encodeBoc(root: Cell, opts: { idx?: boolean, crc32?: boolean } = {}): EncodedBoc {
  const buf = root.toBoc({ idx: opts.idx ?? false, crc32: opts.crc32 ?? true })
  const base64 = buf.toString('base64')
  return {
    bytes: Uint8Array.from(buf),
    base64,
    base64url: base64.replace(/\+/g, '-').replace(/\//g, '_'),
    hex: buf.toString('hex')
  }
}

/** Saves bytes as a file (browser only). */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
