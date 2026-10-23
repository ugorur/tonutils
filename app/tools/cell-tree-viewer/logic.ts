import { Cell, CellType, exoticMerkleProof, exoticMerkleUpdate, exoticPruned } from '@ton/core'
import { encodeBoc, forEachUniqueCell } from '~/lib/boc-basics/boc'

export type CellKind = 'ordinary' | 'pruned' | 'library' | 'merkle-proof' | 'merkle-update'

export const KIND_LABEL: Record<CellKind, string> = {
  'ordinary': 'Ordinary',
  'pruned': 'Pruned branch',
  'library': 'Library',
  'merkle-proof': 'Merkle proof',
  'merkle-update': 'Merkle update'
}

const KIND: Record<CellType, CellKind> = {
  [CellType.Ordinary]: 'ordinary',
  [CellType.PrunedBranch]: 'pruned',
  [CellType.Library]: 'library',
  [CellType.MerkleProof]: 'merkle-proof',
  [CellType.MerkleUpdate]: 'merkle-update'
}

export interface CellInfo {
  kind: CellKind
  /** Representation hash (hex), the one used to reference the cell. */
  hash: string
  bits: number
  refs: number
  level: number
  levelMask: number
  /** Max depth (refs chain length). */
  depth: number
  /** Fift-style hex: upper case, `_` marks completion-tag padding. */
  dataHex: string
  binary: string
  /** Hash and depth for each level 0..level. Level 0 of a pruned branch is the hash of the cell it replaces. */
  levels: { level: number, hash: string, depth: number }[]
  /** Decoded header of an exotic cell. */
  exotic: { label: string, value: string }[]
}

const hex = (b: Buffer) => b.toString('hex')

export function bitsBinary(c: Cell): string {
  let s = ''
  for (let i = 0; i < c.bits.length; i++) s += c.bits.at(i) ? '1' : '0'
  return s
}

function exoticFields(c: Cell, kind: CellKind): CellInfo['exotic'] {
  switch (kind) {
    case 'pruned': {
      const p = exoticPruned(c.bits, c.refs)
      return [
        { label: 'Pruned level mask', value: String(p.mask) },
        ...p.pruned.flatMap((x, i) => [
          { label: `Pruned hash ${i + 1}`, value: hex(x.hash) },
          { label: `Pruned depth ${i + 1}`, value: String(x.depth) }
        ])
      ]
    }
    case 'merkle-proof': {
      const p = exoticMerkleProof(c.bits, c.refs)
      return [{ label: 'Proven hash', value: hex(p.proofHash) }, { label: 'Proven depth', value: String(p.proofDepth) }]
    }
    case 'merkle-update': {
      const p = exoticMerkleUpdate(c.bits, c.refs)
      return [
        { label: 'Old hash', value: hex(p.proofHash1) },
        { label: 'Old depth', value: String(p.proofDepth1) },
        { label: 'New hash', value: hex(p.proofHash2) },
        { label: 'New depth', value: String(p.proofDepth2) }
      ]
    }
    case 'library':
      return [{ label: 'Library code hash', value: hex(c.bits.substring(8, 256).subbuffer(0, 256)!) }]
    default:
      return []
  }
}

export function describeCell(c: Cell): CellInfo {
  const kind = KIND[c.type]
  const level = c.level()
  return {
    kind,
    hash: hex(c.hash()),
    bits: c.bits.length,
    refs: c.refs.length,
    level,
    levelMask: c.mask.value,
    depth: c.depth(),
    dataHex: c.bits.toString(),
    binary: bitsBinary(c),
    levels: Array.from({ length: level + 1 }, (_, l) => ({ level: l, hash: hex(c.hash(l)), depth: c.depth(l) })),
    exotic: exoticFields(c, kind)
  }
}

/** How many distinct parent cells reference each cell (by hash). A count above 1 means the cell is shared (deduplicated in the BOC). */
export function parentCounts(roots: Cell[]): Map<string, number> {
  const counts = new Map<string, number>()
  forEachUniqueCell(roots, (c) => {
    for (const h of new Set(c.refs.map(r => hex(r.hash())))) counts.set(h, (counts.get(h) ?? 0) + 1)
  })
  return counts
}

/** A sub-cell as its own BOC (base64, with CRC32C). */
export function subCellBoc(c: Cell): string {
  return encodeBoc(c).base64
}

/** Lines a fift dump prints: shared cells repeat under every parent, so this can grow exponentially with few distinct cells. */
export function dumpLines(roots: Cell[]): number {
  const memo = new Map<string, number>()
  const count = (c: Cell): number => {
    const h = hex(c.hash())
    let n = memo.get(h)
    if (n === undefined) {
      n = Math.min(Number.MAX_SAFE_INTEGER, 1 + c.refs.reduce((s, r) => s + count(r), 0))
      memo.set(h, n)
    }
    return n
  }
  return roots.reduce((s, r) => s + count(r), 0)
}

/** Fift-style dump (x{…} per cell, indented refs). Check dumpLines first: shared cells are printed again under every parent. */
export function fiftDump(roots: Cell[]): string {
  return roots.map(r => r.toString()).join('\n')
}
