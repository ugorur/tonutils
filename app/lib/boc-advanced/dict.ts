// Typed HashmapE (dictionary) codec shared by dictionary-codec and merkle-proof-tool.
// Key spec:   uint<N> | int<N> | address | bits<N> | sha256   (sha256 = TEP-64 key: sha256 of a field name)
// Value spec: comma-separated fields, each `[name:]type`, type one of
//   uint<N> int<N> coins varuint<N> varint<N> address bool bits<N> ref maybe_ref slice content
// (content = TEP-64 ^ContentData: snake text with a 0x00 prefix, or chunked 0x01).
import type { Builder, DictionaryKey, DictionaryValue, Slice } from '@ton/core'
import { Address, beginCell, Cell, Dictionary } from '@ton/core'
import { sha256_sync } from '@ton/crypto'
import { parseCell, parseInteger, toB64 } from './cells'

// ---------------------------------------------------------------- keys

export type KeyKind = 'uint' | 'int' | 'address' | 'bits' | 'sha256'
export interface KeySpec { kind: KeyKind, bits: number }
export type Key = bigint | Address | Buffer

export function parseKeySpec(spec: string): KeySpec {
  const s = spec.trim().toLowerCase()
  if (s === 'address') return { kind: 'address', bits: 267 }
  if (s === 'sha256') return { kind: 'sha256', bits: 256 }
  const m = /^(uint|int|bits)(\d+)$/.exec(s)
  if (!m) throw new Error(`Unknown key type "${spec}". Use uint<N>, int<N>, address, bits<N> or sha256.`)
  const bits = Number(m[2])
  if (bits < 1 || bits > (m[1] === 'bits' ? 1023 : m[1] === 'int' ? 257 : 256)) throw new Error(`Key size ${bits} is out of range`)
  if (m[1] === 'bits' && bits % 8) throw new Error('bits<N> keys must be a whole number of bytes (N divisible by 8)')
  return { kind: m[1] as KeyKind, bits }
}

export function keyObject(k: KeySpec): DictionaryKey<Key> {
  switch (k.kind) {
    case 'address': return Dictionary.Keys.Address() as DictionaryKey<Key>
    case 'bits': return Dictionary.Keys.Buffer(k.bits / 8) as DictionaryKey<Key>
    case 'int': return Dictionary.Keys.BigInt(k.bits) as DictionaryKey<Key>
    default: return Dictionary.Keys.BigUint(k.bits) as DictionaryKey<Key>
  }
}

/** Field names that TEP-64 (and common NFT/jetton metadata) use; the key is sha256(name). */
export const TEP64_KEYS = ['uri', 'name', 'description', 'image', 'image_data', 'symbol', 'decimals', 'amount_style', 'render_type', 'content_url', 'lottie', 'attributes', 'social', 'social_links', 'websites', 'marketplace', 'external_url', 'cover_image']
let tep64Names: Map<bigint, string> | null = null
export function tep64KeyHash(name: string): bigint {
  return BigInt(`0x${sha256_sync(Buffer.from(name, 'utf8')).toString('hex')}`)
}
function tep64Name(h: bigint): string | undefined {
  tep64Names ??= new Map(TEP64_KEYS.map(n => [tep64KeyHash(n), n]))
  return tep64Names.get(h)
}

export function keyFromString(k: KeySpec, input: string): Key {
  const s = input.trim()
  switch (k.kind) {
    case 'address':
      try {
        return Address.parse(s)
      }
      catch {
        throw new Error(`Key "${input}" is not a TON address`)
      }
    case 'bits': {
      const hex = s.replace(/^0x/i, '')
      if (!/^[0-9a-f]*$/i.test(hex) || hex.length !== k.bits / 4) throw new Error(`Key "${input}" must be ${k.bits / 4} hex characters`)
      return Buffer.from(hex, 'hex')
    }
    case 'sha256':
      if (/^0x[0-9a-f]{1,64}$/i.test(s) || /^[0-9a-f]{64}$/i.test(s)) return BigInt(s.startsWith('0x') ? s : `0x${s}`)
      if (!s) throw new Error('Empty key')
      return tep64KeyHash(s)
    default: {
      const v = parseInteger(s, `Key "${input}"`)
      const max = k.kind === 'uint' ? (1n << BigInt(k.bits)) - 1n : (1n << BigInt(k.bits - 1)) - 1n
      const min = k.kind === 'uint' ? 0n : -(1n << BigInt(k.bits - 1))
      if (v < min || v > max) throw new Error(`Key ${input} does not fit ${k.kind}${k.bits}`)
      return v
    }
  }
}

export function keyToString(k: KeySpec, key: Key, testOnly = false): string {
  if (k.kind === 'address') return (key as Address).toString({ testOnly })
  if (k.kind === 'bits') return (key as Buffer).toString('hex')
  if (k.kind === 'sha256') return tep64Name(key as bigint) ?? `0x${(key as bigint).toString(16).padStart(64, '0')}`
  return (key as bigint).toString()
}

// ---------------------------------------------------------------- values

type FieldType
  = | { t: 'uint' | 'int', bits: number }
    | { t: 'varuint' | 'varint', len: number }
    | { t: 'coins' | 'address' | 'bool' | 'ref' | 'maybe_ref' | 'slice' | 'content' }
    | { t: 'bits', bits: number }
export interface Field { name: string, type: FieldType, label: string }
export interface ValueSpec { fields: Field[], scalar: boolean }

export function parseValueSpec(spec: string): ValueSpec {
  const parts = spec.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) throw new Error('Describe the value, e.g. "coins" or "amount:coins, expires:uint48"')
  const fields = parts.map((p, i): Field => {
    const m = /^(?:([a-z_][\w]*)\s*:\s*)?([a-z_]+)(\d*)$/i.exec(p)
    if (!m) throw new Error(`Cannot read value field "${p}"`)
    const [, name, base, n] = m
    const t = base!.toLowerCase()
    const num = n ? Number(n) : 0
    let type: FieldType
    if (t === 'uint' || t === 'int') {
      if (!num || num > (t === 'int' ? 257 : 256)) throw new Error(`"${p}": give a size, e.g. ${t}32`)
      type = { t, bits: num }
    }
    else if (t === 'varuint' || t === 'varint') {
      if (!num || num & (num - 1) || num < 2 || num > 32) throw new Error(`"${p}": use ${t}16 or ${t}32 (VarUInteger n, n a power of two)`)
      type = { t, len: Math.log2(num) }
    }
    else if (t === 'bits') {
      if (!num || num % 8 || num > 1023) throw new Error(`"${p}": bits<N> needs N divisible by 8`)
      type = { t, bits: num }
    }
    else if (['coins', 'address', 'bool', 'ref', 'maybe_ref', 'slice', 'content'].includes(t) && !n) type = { t } as FieldType
    else throw new Error(`Unknown value type "${p}". Use uint<N>, int<N>, coins, varuint<N>, varint<N>, address, bool, bits<N>, ref, maybe_ref, slice or content.`)
    if (t === 'slice' && i !== parts.length - 1) throw new Error('"slice" takes the rest of the value, so it must be the last field')
    return { name: name ?? `field${i + 1}`, type, label: p }
  })
  const names = new Set(fields.map(f => f.name))
  if (names.size !== fields.length) throw new Error('Field names must be unique')
  return { fields, scalar: fields.length === 1 && !/:/.test(parts[0]!) }
}

/** Snake text (TEP-64 SnakeData), bytes collected across the first-ref chain. */
function readSnake(s: Slice): Buffer {
  const chunks: Buffer[] = []
  let cur: Slice | null = s
  while (cur) {
    if (cur.remainingBits % 8) throw new Error('snake data is not byte-aligned')
    chunks.push(cur.loadBuffer(cur.remainingBits / 8))
    cur = cur.remainingRefs ? cur.loadRef().beginParse() : null
  }
  return Buffer.concat(chunks)
}

export function decodeContent(c: Cell): string {
  const s = c.beginParse()
  const prefix = s.loadUint(8)
  if (prefix === 0) return readSnake(s).toString('utf8')
  if (prefix === 1) {
    const chunks = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
    return Buffer.concat([...chunks.keys()].sort((a, b) => a - b).map(i => readSnake(chunks.get(i)!.beginParse()))).toString('utf8')
  }
  throw new Error(`unknown content data prefix 0x${prefix.toString(16)}`)
}

/** snake#00 data:(SnakeData ~n): 126 bytes in the first cell (after the prefix), 127 in each next one. */
export function encodeContent(text: string): Cell {
  const bytes = Buffer.from(text, 'utf8')
  const chunks: Buffer[] = [bytes.subarray(0, 126)]
  for (let i = 126; i < bytes.length; i += 127) chunks.push(bytes.subarray(i, i + 127))
  let tail: Cell | null = null
  for (let i = chunks.length - 1; i >= 1; i--) {
    const b = beginCell().storeBuffer(chunks[i]!)
    tail = (tail ? b.storeRef(tail) : b).endCell()
  }
  const head = beginCell().storeUint(0, 8).storeBuffer(chunks[0]!)
  return (tail ? head.storeRef(tail) : head).endCell()
}

function readField(f: FieldType, s: Slice, testOnly: boolean): unknown {
  switch (f.t) {
    case 'uint': return s.loadUintBig(f.bits).toString()
    case 'int': return s.loadIntBig(f.bits).toString()
    case 'coins': return s.loadCoins().toString()
    case 'varuint': return s.loadVarUintBig(f.len).toString()
    case 'varint': return s.loadVarIntBig(f.len).toString()
    case 'address': return s.loadMaybeAddress()?.toString({ testOnly }) ?? null
    case 'bool': return s.loadBit()
    case 'bits': return s.loadBuffer(f.bits / 8).toString('hex')
    case 'ref': return toB64(s.loadRef())
    case 'maybe_ref': {
      const r = s.loadMaybeRef()
      return r ? toB64(r) : null
    }
    case 'content': return decodeContent(s.loadRef())
    case 'slice': {
      const rest = s.asCell()
      s.skip(s.remainingBits)
      while (s.remainingRefs) s.loadRef()
      return toB64(rest)
    }
  }
}

function writeField(f: Field, v: unknown, b: Builder) {
  const t = f.type
  const what = `Value field "${f.name}"`
  const need = () => {
    if (v === undefined || v === null || v === '') throw new Error(`${what} is missing`)
    return v as string | number | bigint
  }
  switch (t.t) {
    case 'uint': b.storeUint(parseInteger(need(), what), t.bits); return
    case 'int': b.storeInt(parseInteger(need(), what), t.bits); return
    case 'coins': b.storeCoins(parseInteger(need(), what)); return
    case 'varuint': b.storeVarUint(parseInteger(need(), what), t.len); return
    case 'varint': b.storeVarInt(parseInteger(need(), what), t.len); return
    case 'address':
      if (v === null || v === '') b.storeAddress(null)
      else {
        try {
          b.storeAddress(Address.parse(String(v)))
        }
        catch {
          throw new Error(`${what}: "${v}" is not a TON address`)
        }
      }
      return
    case 'bool':
      if (typeof v !== 'boolean') throw new Error(`${what} must be true or false`)
      b.storeBit(v)
      return
    case 'bits': {
      const hex = String(need()).replace(/^0x/i, '')
      if (!/^[0-9a-f]*$/i.test(hex) || hex.length !== t.bits / 4) throw new Error(`${what} must be ${t.bits / 4} hex characters`)
      b.storeBuffer(Buffer.from(hex, 'hex'))
      return
    }
    case 'ref': b.storeRef(parseCell(String(need()), what)); return
    case 'maybe_ref': b.storeMaybeRef(v === null || v === '' ? null : parseCell(String(v), what)); return
    case 'slice': b.storeSlice(parseCell(String(need()), what).beginParse()); return
    case 'content': b.storeRef(encodeContent(String(v ?? ''))); return
  }
}

export interface DecodedValue { value: unknown, warning?: string }

/** Decodes a leaf (stored as a cell holding the leaf remainder). Reports leftovers: usually a wrong value type. */
export function decodeValue(spec: ValueSpec, leaf: Cell, testOnly = false): DecodedValue {
  const s = leaf.beginParse()
  try {
    const out: Record<string, unknown> = {}
    for (const f of spec.fields) out[f.name] = readField(f.type, s, testOnly)
    const value = spec.scalar ? out[spec.fields[0]!.name] : out
    if (s.remainingBits || s.remainingRefs) return { value, warning: `${s.remainingBits} bits and ${s.remainingRefs} refs left unread: the value type may be wrong` }
    return { value }
  }
  catch (e) {
    return { value: toB64(leaf), warning: `Could not read value as "${spec.fields.map(f => f.label).join(', ')}": ${(e as Error).message}. Showing the raw value cell.` }
  }
}

export function encodeValue(spec: ValueSpec, v: unknown, b: Builder) {
  if (spec.scalar) return writeField(spec.fields[0]!, v, b)
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Each value must be an object with fields ${spec.fields.map(f => f.name).join(', ')}`)
  const o = v as Record<string, unknown>
  const extra = Object.keys(o).filter(k => !spec.fields.some(f => f.name === k))
  if (extra.length) throw new Error(`Unknown value field(s): ${extra.join(', ')}`)
  for (const f of spec.fields) writeField(f, o[f.name], b)
}

/** Dictionary value codec: building writes typed fields; parsing keeps the raw leaf (decoded later with warnings). */
function valueObject(spec: ValueSpec): DictionaryValue<unknown> {
  return {
    serialize: (src, b) => {
      if (src instanceof Cell) b.storeSlice(src.beginParse())
      else encodeValue(spec, src, b)
    },
    parse: s => s.asCell()
  }
}

// ---------------------------------------------------------------- schema + layouts

export interface DictSchema { key: KeySpec, value: ValueSpec }
export type DictLayout = 'auto' | 'direct' | 'hashmapE' | 'tep64'

export function parseSchema(keySpec: string, valueSpec: string): DictSchema {
  return { key: parseKeySpec(keySpec), value: parseValueSpec(valueSpec) }
}

export interface DictPreset { id: string, label: string, key: string, value: string, layout: DictLayout, hint: string }
export const DICT_PRESETS: DictPreset[] = [
  { id: 'tep64', label: 'TEP-64 on-chain metadata', key: 'sha256', value: 'content', layout: 'tep64', hint: 'Jetton/NFT on-chain content: 0x00 prefix + HashmapE 256 ^ContentData. Keys are sha256 of field names (name, symbol, decimals…).' },
  { id: 'airdrop', label: 'Mintless airdrop (TEP-176)', key: 'address', value: 'amount:coins, start_from:uint48, expired_at:uint48', layout: 'direct', hint: 'HashmapE 267 AirdropItem: owner address → amount, unlock and expiry unix times. Its root hash is the minter\'s merkle root.' },
  { id: 'balances', label: 'Address → coins', key: 'address', value: 'coins', layout: 'hashmapE', hint: 'Whitelists, balances, payout lists.' },
  { id: 'nft-batch', label: 'Index → cell (NFT batch deploy, config)', key: 'uint64', value: 'ref', layout: 'hashmapE', hint: 'uint64 index → ^Cell, as in NFT collection batch deploy. Blockchain config uses int32 keys.' },
  { id: 'custom', label: 'Custom', key: 'uint32', value: 'uint64', layout: 'auto', hint: 'Any key and value layout.' }
]

/** Which layout a cell most likely uses. */
export function detectLayout(c: Cell): Exclude<DictLayout, 'auto'> {
  const s = c.beginParse()
  // 0x00 + HashmapE: a 1 bit with the root ref, or a 0 bit for empty on-chain content
  if (c.bits.length === 9 && s.preloadUint(8) === 0 && c.refs.length === (s.skip(8).preloadBit() ? 1 : 0)) return 'tep64'
  if (c.bits.length === 8 && !c.refs.length && s.preloadUint(8) === 0) return 'tep64'
  if (c.bits.length === 1 && c.refs.length === (c.beginParse().preloadBit() ? 1 : 0)) return 'hashmapE'
  return 'direct'
}

export function loadDict(cell: Cell, schema: DictSchema, layout: DictLayout) {
  const used = layout === 'auto' ? detectLayout(cell) : layout
  const k = keyObject(schema.key)
  const v = valueObject(schema.value)
  let dict: Dictionary<Key, unknown>
  try {
    if (used === 'direct') dict = Dictionary.loadDirect(k, v, cell)
    else {
      const s = cell.beginParse()
      if (used === 'tep64') {
        const p = s.loadUint(8)
        if (p !== 0) throw new Error(`content prefix is 0x${p.toString(16)}, on-chain metadata starts with 0x00 (0x01 is an off-chain URL)`)
      }
      dict = Dictionary.load(k, v, s)
    }
  }
  catch (e) {
    throw new Error(`Not a dictionary with ${schema.key.kind}${schema.key.kind === 'address' || schema.key.kind === 'sha256' ? '' : schema.key.bits} keys in "${used}" layout: ${(e as Error).message}`)
  }
  return { dict, layout: used }
}

export interface DictEntry { key: string, value: unknown, warning?: string }

export function dictEntries(dict: Dictionary<Key, unknown>, schema: DictSchema, testOnly = false): DictEntry[] {
  return [...dict].map(([key, leaf]) => ({ key: keyToString(schema.key, key, testOnly), ...decodeValue(schema.value, leaf as Cell, testOnly) }))
}

/** JSON object {key: value}, array of [key, value] or array of {key, value} → typed Dictionary. */
export function dictFromJson(json: string, schema: DictSchema): Dictionary<Key, unknown> {
  let data: unknown
  try {
    data = JSON.parse(json)
  }
  catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  let pairs: [string, unknown][]
  if (Array.isArray(data)) {
    pairs = data.map((item, i) => {
      if (Array.isArray(item) && item.length === 2) return [String(item[0]), item[1]]
      if (item && typeof item === 'object' && 'key' in item && 'value' in item) return [String(item.key), item.value]
      throw new Error(`Item ${i + 1}: use [key, value] or {"key": …, "value": …}`)
    })
  }
  else if (data && typeof data === 'object') pairs = Object.entries(data)
  else throw new Error('JSON must be an object {"key": value} or an array of [key, value] pairs')
  const dict = Dictionary.empty<Key, unknown>(keyObject(schema.key), valueObject(schema.value))
  const seen = new Set<string>()
  for (const [ks, v] of pairs) {
    const key = keyFromString(schema.key, ks)
    const id = keyToString(schema.key, key)
    if (seen.has(id)) throw new Error(`Duplicate key ${ks}`)
    seen.add(id)
    try {
      encodeValue(schema.value, v, beginCell()) // validate now, with the key in the message
    }
    catch (e) {
      throw new Error(`Key ${ks}: ${(e as Error).message}`)
    }
    dict.set(key, v)
  }
  return dict
}

/** The three ways a dictionary is stored. `direct` is null for an empty dict (Hashmap needs at least one entry). */
export function storeDictLayouts(dict: Dictionary<Key, unknown>) {
  return {
    direct: dict.size ? beginCell().storeDictDirect(dict).endCell() : null,
    hashmapE: beginCell().storeDict(dict).endCell(),
    tep64: beginCell().storeUint(0, 8).storeDict(dict).endCell()
  }
}

/** Pretty JSON of entries for the builder textarea (round-trippable). */
export function entriesToJson(entries: DictEntry[]): string {
  return JSON.stringify(Object.fromEntries(entries.map(e => [e.key, e.value])), null, 2)
}
