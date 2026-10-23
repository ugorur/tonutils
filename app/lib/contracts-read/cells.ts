// Helpers shared by the contracts-read tools (inspector, library resolver, source lookup, get-method runner).
// Pure TS on @ton/core: import from logic.ts / Tool.vue only.
import { Address, Cell, CellType } from '@ton/core'
import { detectWalletVersion, type WalletKind } from '~/utils/ton/wallets'

/** 32-byte hash as lowercase hex from hex, base64 or base64url; null when it is not a 32-byte hash. */
export function normalizeHash(input: string): string | null {
  const s = input.trim().replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase()
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) return null
  const bytes = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return bytes.length === 32 ? bytes.toString('hex') : null
}

export const hexToBase64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64')

/** Library hash (hex) referenced by an exotic library cell, else null. */
export function libraryHashOf(cell: Cell): string | null {
  if (cell.type !== CellType.Library) return null
  return cell.beginParse(true).skip(8).loadBuffer(32).toString('hex')
}

export interface LibraryRef {
  /** Hash of the library cell itself: what indexers show as the account's code hash. */
  cellHash: string
  /** Hash of the real code the cell points to (the library key on the masterchain). */
  libraryHash: string
  /** 'root' when the whole code is the library cell. */
  path: string
}

/** Every library cell in the tree (deduplicated), with a path like root.0.1 for nested ones. */
export function findLibraryCells(root: Cell): LibraryRef[] {
  const out: LibraryRef[] = []
  const seen = new Set<string>()
  const walk = (c: Cell, path: string) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    const lib = libraryHashOf(c)
    if (lib) out.push({ cellHash: h, libraryHash: lib, path })
    c.refs.forEach((r, i) => walk(r, `${path}.${i}`))
  }
  walk(root, 'root')
  return out
}

export interface CellStats {
  /** Unique cells. */
  cells: number
  bits: number
  depth: number
}

/** "1 cell, 264 bits, depth 0" */
export const statsText = (s: CellStats) => `${s.cells} ${s.cells === 1 ? 'cell' : 'cells'}, ${s.bits} bits, depth ${s.depth}`

export function cellStats(root: Cell): CellStats {
  const seen = new Set<string>()
  let bits = 0
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    bits += c.bits.length
    c.refs.forEach(walk)
  }
  walk(root)
  return { cells: seen.size, bits, depth: root.depth() }
}

export interface CodeSummary {
  hashHex: string
  hashBase64: string
  stats: CellStats
  libraries: LibraryRef[]
  /** Hash that identifies the real code: the library hash when the code is a single library cell. */
  effectiveHash: string
  wallet: WalletKind | null
}

export function summarizeCode(code: Cell): CodeSummary {
  const hash = code.hash()
  const libraries = findLibraryCells(code)
  const rootLib = libraries.find(l => l.path === 'root')
  const effectiveHash = rootLib?.libraryHash ?? hash.toString('hex')
  return {
    hashHex: hash.toString('hex'),
    hashBase64: hash.toString('base64'),
    stats: cellStats(code),
    libraries,
    effectiveHash,
    wallet: detectWalletVersion(effectiveHash)
  }
}

/** Parses a base64 BOC as returned by toncenter/tonapi (also accepts hex). */
export function cellFromApi(boc: string): Cell {
  const s = boc.trim()
  return Cell.fromBoc(Buffer.from(s, /^[0-9a-f]+$/i.test(s) ? 'hex' : 'base64'))[0]!
}

export type AddressOrHash =
  | { kind: 'address', address: Address }
  | { kind: 'hash', hex: string }

/** Classifies user input as a TON address or a 32-byte hash (hex/base64). Throws a readable error otherwise. */
export function parseAddressOrHash(input: string): AddressOrHash {
  const s = input.trim()
  if (!s) throw new Error('Enter a contract address or a code hash')
  if (Address.isFriendly(s) || Address.isRaw(s)) return { kind: 'address', address: Address.parse(s) }
  const hex = normalizeHash(s)
  if (hex) return { kind: 'hash', hex }
  throw new Error('Not a TON address or a 32-byte hash. Use EQ…/UQ…/0:… or 64 hex characters.')
}
