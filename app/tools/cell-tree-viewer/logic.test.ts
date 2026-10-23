import { describe, expect, it } from 'vitest'
import { beginCell, Cell } from '@ton/core'
import { parseRoots } from '~/lib/boc-basics/boc'
import { COMMENT_BODY_BOC, COMMENT_TEXT, PROOF_BOC_HEX, SHARD_ROOT_HASH_HEX, TX1_BOC, TX1_HASH_B64 } from '~/lib/boc-basics/vectors'
import { describeCell, dumpLines, fiftDump, parentCounts, subCellBoc } from './logic'

const find = (root: Cell, pred: (c: Cell) => boolean): Cell | null => {
  if (pred(root)) return root
  for (const r of root.refs) {
    const f = find(r, pred)
    if (f) return f
  }
  return null
}

describe('describeCell', () => {
  it('describes an ordinary cell from a real comment body', () => {
    const c = Cell.fromBase64(COMMENT_BODY_BOC)
    const i = describeCell(c)
    expect(i).toMatchObject({ kind: 'ordinary', level: 0, levelMask: 0, refs: 1, depth: 1 })
    // TEP-74 text comment: 32 zero bits, then UTF-8 (toncenter decoded the full text as COMMENT_TEXT)
    const firstBytes = Buffer.from(COMMENT_TEXT, 'utf8').subarray(0, (i.bits - 32) / 8)
    expect(i.dataHex).toBe(`00000000${firstBytes.toString('hex').toUpperCase()}`)
    expect(i.binary).toHaveLength(i.bits)
    expect(i.binary.slice(0, 40)).toBe(`${'0'.repeat(32)}01000000`) // '@' = 0x40
    expect(i.levels).toEqual([{ level: 0, hash: i.hash, depth: 1 }])
    expect(i.exotic).toEqual([])
  })

  it('shows fift-style padding for bit lengths that are not a multiple of 4', () => {
    expect(describeCell(beginCell().storeUint(1, 1).endCell()).dataHex).toBe('C_')
    expect(describeCell(beginCell().storeUint(0b101, 3).storeUint(0, 2).endCell()).dataHex).toBe('A4_') // 10100 + tag 1 + 00 = 1010 0100
  })

  it('decodes a real Merkle proof (tonapi liteserver) whose proven hash is the shard block root hash', () => {
    const [proof] = parseRoots(PROOF_BOC_HEX)
    const i = describeCell(proof!)
    expect(i.kind).toBe('merkle-proof')
    expect(i.exotic.find(f => f.label === 'Proven hash')!.value).toBe(SHARD_ROOT_HASH_HEX)
    // the proven cell's level-0 hash, recomputed through pruned branches, equals the block root hash
    expect(describeCell(proof!.refs[0]!).levels[0]!.hash).toBe(SHARD_ROOT_HASH_HEX)
    expect(i.level).toBe(0)
  })

  it('decodes pruned branches inside the proof', () => {
    const [proof] = parseRoots(PROOF_BOC_HEX)
    const pruned = find(proof!, c => c.type === 1)!
    const i = describeCell(pruned)
    expect(i.kind).toBe('pruned')
    expect(i.level).toBeGreaterThanOrEqual(1)
    expect(i.refs).toBe(0)
    // level-0 hash of a pruned branch is the hash it stores (the hash of the removed subtree)
    expect(i.exotic.find(f => f.label === 'Pruned hash 1')!.value).toBe(i.levels[0]!.hash)
    expect(i.levels).toHaveLength(i.level + 1)
  })
})

describe('parentCounts / subCellBoc / fiftDump', () => {
  it('flags a cell referenced by two parents as shared, but not one referenced twice by the same parent', () => {
    const leaf = beginCell().storeUint(7, 8).endCell()
    const a = beginCell().storeUint(1, 8).storeRef(leaf).endCell()
    const b = beginCell().storeUint(2, 8).storeRef(leaf).storeRef(leaf).endCell()
    const root = beginCell().storeRef(a).storeRef(b).endCell()
    const counts = parentCounts([root])
    expect(counts.get(leaf.hash().toString('hex'))).toBe(2)
    expect(counts.get(a.hash().toString('hex'))).toBe(1)
  })

  it('exports a sub-cell of a real transaction as a BOC with the same hash', () => {
    const tx = Cell.fromBase64(TX1_BOC)
    expect(tx.hash().toString('base64')).toBe(TX1_HASH_B64)
    const sub = tx.refs[0]!
    expect(Cell.fromBase64(subCellBoc(sub)).hash().equals(sub.hash())).toBe(true)
  })

  it('dumps cells in fift x{…} notation', () => {
    const c = beginCell().storeUint(0xab, 8).storeRef(beginCell().storeUint(1, 1).endCell()).endCell()
    expect(fiftDump([c])).toBe('x{AB}\n x{C_}')
    expect(dumpLines([c])).toBe(2)
  })

  it('counts dump lines with shared cells repeated (exponential in depth) without expanding them', () => {
    let c = beginCell().storeUint(1, 8).endCell()
    for (let i = 0; i < 40; i++) c = beginCell().storeUint(i, 8).storeRef(c).storeRef(c).endCell()
    expect(dumpLines([c])).toBe(2 ** 41 - 1)
    // a real transaction has no sharing: one line per cell (toncenter BOC header says 12 cells)
    expect(dumpLines([Cell.fromBase64(TX1_BOC)])).toBe(12)
    expect(fiftDump([Cell.fromBase64(TX1_BOC)]).split('\n')).toHaveLength(12)
  })
})
