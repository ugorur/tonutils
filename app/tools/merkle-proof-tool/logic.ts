import type { Cell } from '@ton/core'
import { beginCell, CellType, exoticMerkleProof, exoticMerkleUpdate, exoticPruned, generateMerkleProof, generateMerkleUpdate } from '@ton/core'
import { hashHex, parseCell, parseHash } from '~/lib/boc-advanced/cells'
import type { DictEntry, DictLayout, DictSchema, Key } from '~/lib/boc-advanced/dict'
import { dictEntries, dictFromJson, encodeValue, keyFromString, keyObject, loadDict, parseSchema } from '~/lib/boc-advanced/dict'

/** TEP-176 merkle_airdrop_claim#0df602d6 proof:^Cell = CustomPayload. */
export const AIRDROP_CLAIM_OP = 0x0df602d6

export interface DictOptions { keySpec: string, valueSpec: string, layout: DictLayout }

export interface PrunedBranch {
  /** Ref indexes from the proof's virtual root, e.g. "1 → 0 → 1"; "old"/"new" side for updates. */
  path: string
  hash: string
  depth: number
}

export interface ProofSide {
  hash: string
  depth: number
  pruned: PrunedBranch[]
  /** Distinct ordinary cells kept in the proof. */
  cells: number
  entries?: DictEntry[]
  entriesError?: string
}

export interface ProofReport {
  kind: 'proof' | 'update'
  /** Where the Merkle cell was found if it was not the root. */
  wrapper: string | null
  proof: ProofSide
  /** Merkle update only: the new state. */
  update?: ProofSide
  /** Compared with the expected root hash, if one was given: 'old'/'new' say which side of an update matched. */
  expected: 'match' | 'old' | 'new' | 'mismatch' | null
  merkleCell: Cell
}

function findMerkle(root: Cell): { cell: Cell, wrapper: string | null } {
  if (root.type === CellType.MerkleProof || root.type === CellType.MerkleUpdate) return { cell: root, wrapper: null }
  const s = root.beginParse(true)
  const op = root.bits.length >= 32 && !root.isExotic ? s.preloadUint(32) : null
  const queue: { c: Cell, path: number[] }[] = root.refs.map((c, i) => ({ c, path: [i] }))
  while (queue.length) {
    const { c, path } = queue.shift()!
    if (c.type === CellType.MerkleProof || c.type === CellType.MerkleUpdate) {
      const where = op === AIRDROP_CLAIM_OP && path.length === 1
        ? 'TEP-176 mintless claim payload (merkle_airdrop_claim#0df602d6)'
        : `ref ${path.join(' → ')} of the pasted cell`
      return { cell: c, wrapper: where }
    }
    if (path.length < 3 && !c.isExotic) queue.push(...c.refs.map((r, i) => ({ c: r, path: [...path, i] })))
  }
  throw new Error('No Merkle proof (exotic type 3) or Merkle update (type 4) cell found in this BOC.')
}

function walk(root: Cell, prefix: string) {
  const pruned: PrunedBranch[] = []
  const seen = new Set<string>()
  const go = (c: Cell, path: number[]) => {
    if (c.type === CellType.PrunedBranch) {
      const p = exoticPruned(c.bits, c.refs).pruned[0]!
      pruned.push({ path: [prefix, ...path].filter(Boolean).join(' → ') || 'root', hash: p.hash.toString('hex'), depth: p.depth })
      return
    }
    const h = hashHex(c)
    if (seen.has(h)) return
    seen.add(h)
    c.refs.forEach((r, i) => go(r, [...path, i]))
  }
  go(root, [])
  return { pruned, cells: seen.size }
}

function side(virtualRoot: Cell, hash: Buffer, depth: number, prefix: string, schema: DictSchema | null, layout: DictLayout, testOnly: boolean): ProofSide {
  const out: ProofSide = { hash: hash.toString('hex'), depth, ...walk(virtualRoot, prefix) }
  if (schema) {
    try {
      out.entries = dictEntries(loadDict(virtualRoot, schema, layout).dict, schema, testOnly)
    }
    catch (e) {
      out.entriesError = (e as Error).message
    }
  }
  return out
}

/** Reads a Merkle proof/update (bare, or wrapped e.g. in a TEP-176 claim payload) and lists what it proves. */
export function inspectProof(input: string, opts: { expectedRoot?: string, dict?: DictOptions | null, testOnly?: boolean } = {}): ProofReport {
  const { cell, wrapper } = findMerkle(parseCell(input, 'Proof BOC'))
  const schema = opts.dict ? parseSchema(opts.dict.keySpec, opts.dict.valueSpec) : null
  const layout = opts.dict?.layout ?? 'direct'
  const testOnly = opts.testOnly ?? false
  const expected = opts.expectedRoot?.trim() ? parseHash(opts.expectedRoot).toString('hex') : null
  // Cell.fromBoc already rejected proofs whose stored hash/depth disagree with the content; these re-read the values.
  if (cell.type === CellType.MerkleProof) {
    const m = exoticMerkleProof(cell.bits, cell.refs)
    const proof = side(cell.refs[0]!, m.proofHash, m.proofDepth, '', schema, layout, testOnly)
    return { kind: 'proof', wrapper, proof, expected: expected === null ? null : expected === proof.hash ? 'match' : 'mismatch', merkleCell: cell }
  }
  const m = exoticMerkleUpdate(cell.bits, cell.refs)
  const proof = side(cell.refs[0]!, m.proofHash1, m.proofDepth1, 'old', schema, layout, testOnly)
  const update = side(cell.refs[1]!, m.proofHash2, m.proofDepth2, 'new', schema, layout, testOnly)
  return {
    kind: 'update',
    wrapper,
    proof,
    update,
    expected: expected === null ? null : expected === proof.hash ? 'old' : expected === update.hash ? 'new' : 'mismatch',
    merkleCell: cell
  }
}

// ---------------------------------------------------------------- building

export interface DictSource { boc?: string, json?: string }

function loadSource(src: DictSource, opts: DictOptions) {
  const schema = parseSchema(opts.keySpec, opts.valueSpec)
  if (src.boc?.trim()) {
    const cell = parseCell(src.boc, 'Dictionary BOC')
    const { dict, layout } = loadDict(cell, schema, opts.layout)
    const original = layout === 'direct' ? cell : cell.refs[0]
    if (!original) throw new Error('The dictionary is empty: there is nothing to prove.')
    // A proof must commit to the same root the chain stores. @ton/core re-serializes the dict, so check it is identical.
    const reserialized = beginCell().storeDictDirect(dict).endCell()
    if (!reserialized.equals(original)) throw new Error('This dictionary uses a non-canonical label encoding, so a rebuilt proof would not match its root hash.')
    return { schema, dict }
  }
  if (src.json?.trim()) return { schema, dict: dictFromJson(src.json, schema) }
  throw new Error('Paste the full dictionary (BOC or JSON) to build a proof from.')
}

function parseKeys(schema: DictSchema, keys: string[], has: (k: Key) => boolean): Key[] {
  const list = keys.map(k => k.trim()).filter(Boolean)
  if (!list.length) throw new Error('Enter at least one key to prove.')
  return list.map((k) => {
    const key = keyFromString(schema.key, k)
    if (!has(key)) throw new Error(`Key ${k} is not in the dictionary.`)
    return key
  })
}

export function claimPayload(proof: Cell): Cell {
  return beginCell().storeUint(AIRDROP_CLAIM_OP, 32).storeRef(proof).endCell()
}

export function buildProof(src: DictSource, opts: DictOptions, keys: string[]) {
  const { schema, dict } = loadSource(src, opts)
  const list = parseKeys(schema, keys, k => dict.has(k))
  const proof = generateMerkleProof(dict, list, keyObject(schema.key))
  return { proof, rootHash: proof.refs[0]!.hash(0).toString('hex'), keys: list.length, entries: dict.size, claim: claimPayload(proof) }
}

/**
 * New value: JSON (object, quoted string, true/false/null) or a bare value for scalars. Bare numbers stay strings so
 * a uint64 like 18446744073709551615 is not rounded by JSON.parse.
 */
export function parseNewValue(input: string): unknown {
  const s = input.trim()
  if (!/^(?:[{["]|true$|false$|null$)/.test(s)) return s
  try {
    return JSON.parse(s)
  }
  catch {
    return s
  }
}

export function buildUpdate(src: DictSource, opts: DictOptions, key: string, newValue: string) {
  const { schema, dict } = loadSource(src, opts)
  const [k] = parseKeys(schema, [key], kk => dict.has(kk))
  const v = parseNewValue(newValue)
  encodeValue(schema.value, v, beginCell()) // validate before touching the dict
  const update = generateMerkleUpdate(dict, k!, keyObject(schema.key), v)
  return { update, oldHash: update.refs[0]!.hash(0).toString('hex'), newHash: update.refs[1]!.hash(0).toString('hex') }
}
