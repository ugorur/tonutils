// TVM instruction table (codepage 0) from ton-community/tvm-spec cp0.json, stripped to what the UI shows.
import data from './cp0.json'

export interface Instruction {
  /** tvm-spec id, e.g. PUSHINT_4 */
  m: string
  /** Fift assembler syntax */
  f: string
  /** Bytecode prefix in hex; a trailing "_" is the Fift completion tag (the prefix is not whole nibbles). */
  p: string
  /** TL-B of the encoding incl. operands */
  t: string
  /** Category id */
  c: string
  /** Description (markdown-ish) */
  d: string
  /** Gas, e.g. "26" or "34/84" */
  g: string
  /** Stack effect, "inputs - outputs" */
  s: string
  /** TVM version that introduced it (9999 = not yet assigned in the spec) */
  v: number
}

export interface Alias {
  m: string
  /** tvm-spec id of the real instruction */
  of: string
  f: string
  s: string
  d: string
  o: Record<string, unknown>
}

export const SOURCE: string = data.source
export const INSTRUCTIONS = data.instructions as Instruction[]
export const ALIASES = data.aliases as Alias[]

export const CATEGORY_LABELS: Record<string, string> = {
  stack_basic: 'Stack: basic', stack_complex: 'Stack: complex', const_int: 'Constants: integers', const_data: 'Constants: data',
  arithm_basic: 'Arithmetic', arithm_div: 'Arithmetic: division', arithm_logical: 'Arithmetic: logical', arithm_quiet: 'Arithmetic: quiet',
  compare_int: 'Compare: integers', compare_other: 'Compare: other',
  cell_build: 'Cells: build', cell_parse: 'Cells: parse',
  cont_basic: 'Continuations: basic', cont_conditional: 'Continuations: conditional', cont_create: 'Continuations: create',
  cont_dict: 'Continuations: dictionary', cont_loops: 'Continuations: loops', cont_registers: 'Continuations: registers', cont_stack: 'Continuations: stack',
  exceptions: 'Exceptions',
  dict_serial: 'Dictionaries: serialization', dict_get: 'Dictionaries: get', dict_set: 'Dictionaries: set', dict_set_builder: 'Dictionaries: set builder',
  dict_delete: 'Dictionaries: delete', dict_mayberef: 'Dictionaries: maybe ref', dict_prefix: 'Dictionaries: prefix', dict_next: 'Dictionaries: next/prev',
  dict_min: 'Dictionaries: min/max', dict_special: 'Dictionaries: special', dict_sub: 'Dictionaries: subdict',
  app_actions: 'Blockchain: actions', app_addr: 'Blockchain: addresses', app_config: 'Blockchain: config & context', app_crypto: 'Blockchain: crypto',
  app_currency: 'Blockchain: currency', app_gas: 'Blockchain: gas', app_global: 'Blockchain: globals', app_misc: 'Blockchain: misc', app_rnd: 'Blockchain: random',
  tuple: 'Tuples', codepage: 'Codepage', debug: 'Debug'
}

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c

const HEX_BITS = (h: string) => [...h].map(c => Number.parseInt(c, 16).toString(2).padStart(4, '0')).join('')

/** Hex with an optional Fift completion tag ("C_": drop trailing zeros and the last 1) → bit string. */
export function hexToBits(hex: string): string {
  const clean = hex.trim().replace(/^x\{|\}$/gi, '').replace(/\s+/g, '')
  if (!/^[0-9a-f]*_?$/i.test(clean)) throw new Error('Use hex digits only (a trailing _ is allowed).')
  const tagged = clean.endsWith('_')
  const bits = HEX_BITS(clean.replace(/_$/, ''))
  if (!tagged) return bits
  const end = bits.lastIndexOf('1')
  if (end < 0) throw new Error('A completion tag "_" needs a 1 bit to remove.')
  return bits.slice(0, end)
}

const PREFIX_BITS = INSTRUCTIONS.map(i => ({ i, bits: hexToBits(i.p) }))

/** Which instruction does this bytecode start with? Longest matching prefix wins. */
export function decodeBits(bits: string): { instruction: Instruction, prefixBits: number } | null {
  let best: { i: Instruction, bits: string } | null = null
  for (const p of PREFIX_BITS) {
    if (bits.startsWith(p.bits) && (!best || p.bits.length > best.bits.length)) best = p
  }
  return best ? { instruction: best.i, prefixBits: best.bits.length } : null
}

export function decodeHex(hex: string) {
  return decodeBits(hexToBits(hex))
}

const NAMES = new Set([...INSTRUCTIONS.flatMap(i => [i.m, ...i.f.split(/\s+/)]), ...ALIASES.map(a => a.m)].map(n => n.toUpperCase()))

/** True when the query could be bytecode the user wants decoded (at least 2 hex digits, and not a mnemonic like ADD or DEC). */
export function looksLikeHex(q: string): boolean {
  const s = q.trim().replace(/\s+/g, '')
  return /^(x\{)?[0-9a-f]{2,}_?\}?$/i.test(s) && !NAMES.has(s.toUpperCase())
}

export const byId = (m: string) => INSTRUCTIONS.find(i => i.m === m)

/**
 * Mnemonic / Fift / description search, ranked: exact name, name prefix, name contains, description.
 * Aliases (DUP, SWAP, …) resolve to the instruction they stand for.
 */
export function searchInstructions(query: string, category?: string): Instruction[] {
  const pool = category ? INSTRUCTIONS.filter(i => i.c === category) : INSTRUCTIONS
  const q = query.trim().toUpperCase()
  if (!q) return [...pool]
  const rank = (i: Instruction) => {
    const names = [i.m, ...i.f.split(/\s+/).filter(t => t && !t.startsWith('['))].map(s => s.toUpperCase())
    if (names.includes(q)) return 0
    if (names.some(n => n.startsWith(q))) return 1
    if (i.m.includes(q)) return 2
    if (i.d.toUpperCase().includes(q)) return 3
    return 9
  }
  const aliasHits = new Set(ALIASES.filter(a => a.m.toUpperCase() === q).map(a => a.of))
  return pool
    .map(i => ({ i, r: aliasHits.has(i.m) ? 0 : rank(i) }))
    .filter(x => x.r < 9)
    .sort((a, b) => a.r - b.r)
    .map(x => x.i)
}

export const aliasesOf = (m: string) => ALIASES.filter(a => a.of === m)

export function versionLabel(v: number): string {
  if (v === 0) return 'since TVM launch'
  if (v === 9999) return 'version not assigned yet'
  return `since TVM v${v}`
}
