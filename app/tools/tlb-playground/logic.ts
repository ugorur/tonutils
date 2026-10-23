// TL-B playground: decode cells with @ton-community/tlb-runtime, encode JSON back with our own encoder.
// The runtime's own serializer (1.0.0-alpha.3) cannot store parametrized types (Maybe X, Either X Y) or JSON input,
// so encodeJson() walks the runtime's parsed schema itself and mirrors exactly what the decoder produces.
import { Address, BitString, Builder, Cell, Dictionary, ExternalAddress, beginCell, type DictionaryKeyTypes } from '@ton/core'
import type { TLBRuntime } from '@ton-community/tlb-runtime'
import { parseBoc } from '~/utils/ton/messages'

type RuntimeModule = typeof import('@ton-community/tlb-runtime')
type ParserModule = { parse: (src: string) => { succeeded(): boolean, message?: string } }

// ---------------------------------------------------------------- schema IR (shape of tlb-codegen's TLBCode)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Expr = any
interface FieldType {
  kind: string
  [k: string]: Expr
}
interface Field { name: string, anonymous: boolean, fieldType: FieldType, subFields: Field[] }
interface Param { variable: { name: string, type: 'Type' | '#', negated: boolean, isConst: boolean }, argName?: string }
interface Ctor {
  name: string
  tag: { bitLen: number, binary: string }
  fields: Field[]
  parameters: Param[]
  parametersMap: Map<string, Param>
  declaration: string
}
interface TlbType { name: string, constructors: Ctor[] }

export interface Schema {
  runtime: TLBRuntime
  types: Map<string, TlbType>
  typeNames: string[]
  lastType: string
}

export interface TypeSummary {
  name: string
  constructors: { name: string, tag: string, fields: string[] }[]
}

export class SchemaError extends Error {}

function formatTag(tag: Ctor['tag']): string {
  if (!tag.bitLen) return ''
  const v = BigInt(tag.binary)
  return tag.bitLen % 4 === 0 ? `#${v.toString(16).padStart(tag.bitLen / 4, '0')}` : `$${v.toString(2).padStart(tag.bitLen, '0')}`
}

/** Parses and compiles a schema. Syntax errors carry line/column from the TL-B grammar. */
export function compileSchema(rt: RuntimeModule, parser: ParserModule, schema: string): Schema {
  if (!schema.trim()) throw new SchemaError('Enter a TL-B schema')
  const m = parser.parse(schema)
  if (!m.succeeded()) throw new SchemaError(m.message ?? 'TL-B syntax error')
  const res = rt.TLBRuntime.from(schema)
  if (!res.success) {
    throw new SchemaError('The schema is valid TL-B, but the runtime cannot compile one of its constructs '
      + '(dependent types such as SnakeData ~n, or a type used but never declared).')
  }
  const runtime = res.value
  // The runtime always turns byte-aligned bit strings into latin1 text; keep them as bits so nothing is lossy.
  const internals = runtime as unknown as { config: { autoText: boolean }, types: Map<string, TlbType>, lastTypeName: string }
  internals.config.autoText = false
  const typeNames = [...internals.types.keys()]
  return { runtime, types: internals.types, typeNames, lastType: typeNames.includes(internals.lastTypeName) ? internals.lastTypeName : typeNames.at(-1)! }
}

export function summarize(schema: Schema): TypeSummary[] {
  return [...schema.types.values()].map(t => ({
    name: t.name,
    constructors: t.constructors.map(c => ({ name: c.name, tag: formatTag(c.tag), fields: c.fields.map(f => f.name) }))
  }))
}

// ---------------------------------------------------------------- decode

export interface Decoded {
  type: string
  /** JSON-safe value: bigint → string, Address → EQ… string, bits → hex (TON `_` completion), cells → base64 BOC. */
  value: unknown
  leftover: { bits: number, refs: number }
  cellHash: string
}

/** typeName 'auto': match a constructor tag first, then try the last declared type, then every type. */
export function decodeBoc(schema: Schema, boc: string, typeName: string): Decoded {
  let cell: Cell
  try {
    cell = parseBoc(boc)
  }
  catch {
    throw new Error('Not a valid BOC. Paste base64 (te6cc…) or hex (b5ee9c72…).')
  }
  if (typeName !== 'auto') {
    const r = tryDecode(schema, cell, typeName)
    if ('error' in r) throw new Error(`Could not decode as ${typeName}: ${r.error}`)
    return r
  }
  // auto: the type whose constructor tag matches, then the last declared type, then every type in order.
  // The first decode that consumes the whole cell wins; otherwise the first that succeeded at all.
  const candidates = [...new Set([tagMatch(schema, cell), schema.lastType, ...schema.typeNames].filter((t): t is string => !!t))]
  let partial: Decoded | null = null
  for (const t of candidates) {
    const r = tryDecode(schema, cell, t)
    if ('error' in r) continue
    if (!r.leftover.bits && !r.leftover.refs) return r
    partial ??= r
  }
  if (partial) return partial
  throw new Error('No type in the schema decodes this cell. Check the schema, or pick the type by hand to see the exact error.')
}

function tagMatch(schema: Schema, cell: Cell): string | null {
  try {
    const r = schema.runtime.deserialize(cell, true)
    return r.success ? typeOfKind((r.value as { kind: string }).kind) : null
  }
  catch {
    return null // the runtime throws (instead of returning a failure) on some out-of-bounds reads
  }
}

function tryDecode(schema: Schema, cell: Cell, type: string): Decoded | { error: string } {
  const slice = cell.beginParse(true)
  try {
    const r = schema.runtime.deserializeByTypeName(type, slice)
    if (!r.success) return { error: r.error.message }
    return {
      type,
      value: toJson(r.value, schema.types),
      leftover: { bits: slice.remainingBits, refs: slice.remainingRefs },
      cellHash: cell.hash().toString('hex')
    }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
}

/** `Type` or `Type_ctor` → `Type` (same split the runtime uses). */
function typeOfKind(kind: string) {
  const i = kind.indexOf('_')
  return i === -1 ? kind : kind.slice(0, i)
}

function ctorOfKind(kind: string, types: Map<string, TlbType>): Ctor | undefined {
  const type = types.get(typeOfKind(kind))
  if (!type) return undefined
  const name = kind.slice(type.name.length + 1)
  return name ? type.constructors.find(c => c.name === name) : type.constructors[0]
}

/** BitString → hex with TON's `_` completion tag (BitString.toString() format). */
export function toJson(v: unknown, types: Map<string, TlbType>): unknown {
  if (typeof v === 'bigint') return v.toString()
  if (v === null || v === undefined || typeof v !== 'object') return v ?? null
  if (v instanceof Address || v instanceof ExternalAddress || v instanceof BitString) return v.toString()
  if (v instanceof Cell) return v.toBoc().toString('base64')
  if (v instanceof Dictionary) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of v) out[String(k)] = toJson(x, types)
    return out
  }
  if (Array.isArray(v)) return v.map(x => toJson(x, types))
  const obj = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const ctor = typeof obj.kind === 'string' ? ctorOfKind(obj.kind, types) : undefined
  // kind, then parameters, then fields in declaration order (the runtime sorts them alphabetically)
  const order = ctor ? ctor.fields.map(f => f.name) : []
  const keys = Object.keys(obj).sort((a, b) => rank(a) - rank(b))
  function rank(k: string) {
    if (k === 'kind') return -2
    const i = order.indexOf(k)
    return i === -1 ? -1 : i
  }
  for (const k of keys) out[k] = toJson(obj[k], types)
  return out
}

// ---------------------------------------------------------------- encode

/** Same arithmetic as tlb-runtime's MathExprEvaluator, so encode and decode agree on bit widths. */
function evaluate(e: Expr, vars: Map<string, number>): number {
  if ('n' in e) return e.n
  if ('x' in e) {
    const v = vars.get(e.x)
    if (v === undefined) throw new Error(`Variable ${e.x} is not defined`)
    return v
  }
  if ('left' in e) {
    const l = evaluate(e.left, vars)
    const r = evaluate(e.right, vars)
    switch (e.operation) {
      case '+': return l + r
      case '-': return l - r
      case '*': return l * r
      case '/': return Math.floor(l / r)
      case '%': return l % r
      case '<<': return l << r
      case '>>': return l >> r
      case '&': return l & r
      case '|': return l | r
      case '^': return l ^ r
      case '==': case '=': return l === r ? 1 : 0
      case '!=': return l !== r ? 1 : 0
      case '<': return l < r ? 1 : 0
      case '<=': return l <= r ? 1 : 0
      case '>': return l > r ? 1 : 0
      case '>=': return l >= r ? 1 : 0
    }
    throw new Error(`Unknown operation ${e.operation}`)
  }
  if ('value' in e) {
    switch (e.operation) {
      case '.': {
        const inner = e.value
        if ('left' in inner && inner.operation === '-') {
          const l = evaluate(inner.left, vars)
          const r = evaluate(inner.right, vars)
          return r === 1 ? (l <= 1 ? 0 : Math.ceil(Math.log2(l))) : l - r
        }
        if ('n' in inner) return inner.n <= 0 ? 0 : Math.ceil(Math.log2(inner.n + 1))
        return evaluate(inner, vars)
      }
      case '-': return -evaluate(e.value, vars)
      case '~': return ~evaluate(e.value, vars)
      case '!': return evaluate(e.value, vars) ? 0 : 1
    }
  }
  throw new Error('Unsupported expression in schema')
}

function argValue(arg: FieldType | undefined, vars: Map<string, number>): number | undefined {
  try {
    if (arg?.kind === 'TLBExprMathType') return evaluate(arg.initialExpr, vars)
    if (arg?.kind === 'TLBNumberType') return evaluate(arg.bits, vars)
  }
  catch { /* unbound */ }
  return undefined
}

function toBig(v: unknown, what: string): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
  if (typeof v === 'boolean') return v ? 1n : 0n
  if (typeof v === 'string' && /^-?(\d+|0x[0-9a-f]+)$/i.test(v.trim())) {
    const s = v.trim()
    return s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s)
  }
  throw new Error(`${what}: expected an integer, got ${JSON.stringify(v)}`)
}

function toCell(v: unknown, what: string): Cell {
  if (v instanceof Cell) return v
  if (typeof v === 'string') {
    try {
      return parseBoc(v)
    }
    catch { /* fall through */ }
  }
  throw new Error(`${what}: expected a cell as a base64 or hex BOC string`)
}

/** Parses BitString.toString() output: hex digits, optionally ending in `_` (completion tag). */
export function parseBits(v: unknown, length: number, what: string): BitString {
  if (typeof v === 'boolean' && length === 1) return new BitString(Buffer.from([v ? 0x80 : 0]), 0, 1)
  if (typeof v !== 'string' || !/^[0-9a-f]*_?$/i.test(v)) throw new Error(`${what}: expected bits as hex (e.g. "A3" or "B_"), got ${JSON.stringify(v)}`)
  let bin = [...v.replace('_', '')].map(c => Number.parseInt(c, 16).toString(2).padStart(4, '0')).join('')
  if (v.endsWith('_')) bin = bin.replace(/10*$/, '')
  if (bin.length !== length) throw new Error(`${what}: expected ${length} bits, got ${bin.length}`)
  const b = beginCell()
  for (const c of bin) b.storeBit(c === '1')
  return b.endCell().beginParse().loadBits(length)
}

function parseAddress(v: unknown, what: string): Address | ExternalAddress | null {
  if (v === null) return null
  if (typeof v === 'string') {
    const ext = /^External<(\d+):(\d+)>$/.exec(v)
    if (ext) return new ExternalAddress(BigInt(ext[2]!), Number(ext[1]))
    try {
      return Address.parse(v)
    }
    catch { /* fall through */ }
  }
  throw new Error(`${what}: expected an address (EQ…, UQ…, 0:…) or null, got ${JSON.stringify(v)}`)
}

class Encoder {
  constructor(private types: Map<string, TlbType>) {}

  type(type: TlbType, value: unknown, b: Builder, args: FieldType[], parentVars: Map<string, number>, path: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object for ${type.name}`)
    const obj = value as Record<string, unknown>
    let ctor: Ctor | undefined
    if (typeof obj.kind === 'string') {
      if (typeOfKind(obj.kind) !== type.name && obj.kind !== type.name) throw new Error(`${path}: kind "${obj.kind}" is not a ${type.name}`)
      ctor = ctorOfKind(obj.kind, this.types)
    }
    else if (type.constructors.length === 1) {
      ctor = type.constructors[0]
    }
    if (!ctor) throw new Error(`${path}: set "kind" to one of ${type.constructors.map(c => type.constructors.length > 1 ? `${type.name}_${c.name}` : type.name).join(', ')}`)

    const vars = new Map(parentVars)
    ctor.parameters.forEach((p, i) => {
      if (p.variable.type !== '#') return
      const v = argValue(args[i], parentVars) ?? (typeof obj[p.variable.name] === 'number' ? obj[p.variable.name] as number : undefined)
      if (v !== undefined) {
        vars.set(p.variable.name, v)
        if (p.argName) vars.set(p.argName, v)
      }
    })
    if (ctor.tag.bitLen > 0) b.storeUint(BigInt(ctor.tag.binary), ctor.tag.bitLen)

    for (const f of ctor.fields) {
      const fp = `${path}.${f.name}`
      const v = obj[f.name]
      if (f.subFields.length) {
        const ref = beginCell()
        if (f.subFields.length === 1) {
          const sf = f.subFields[0]!
          if (sf.fieldType.kind === 'TLBCellType') {
            b.storeRef(toCell(v, fp))
            continue
          }
          if (sf.fieldType.kind === 'TLBNamedType') {
            const t = this.types.get(sf.fieldType.name)
            if (!t) throw new Error(`${fp}: type ${sf.fieldType.name} not found`)
            this.type(t, v, ref, sf.fieldType.arguments, vars, fp)
          }
          else {
            this.field(sf, v, ref, vars, ctor, args, fp)
          }
        }
        else {
          const sub = (v ?? {}) as Record<string, unknown>
          for (const sf of f.subFields) this.field(sf, sub[sf.name], ref, vars, ctor, args, `${fp}.${sf.name}`)
        }
        b.storeRef(ref.endCell())
      }
      else {
        this.field(f, v, b, vars, ctor, args, fp)
      }
    }
  }

  field(f: Field, v: unknown, b: Builder, vars: Map<string, number>, ctor: Ctor, args: FieldType[], path: string) {
    this.fieldType(f.fieldType, v, b, vars, ctor, args, path)
    const k = f.fieldType.kind
    if (f.name && (k === 'TLBNumberType' || k === 'TLBVarIntegerType' || k === 'TLBBoolType')) vars.set(f.name, Number(typeof v === 'boolean' ? Number(v) : v))
  }

  fieldType(ft: FieldType, v: unknown, b: Builder, vars: Map<string, number>, ctor: Ctor, args: FieldType[], path: string): void {
    switch (ft.kind) {
      case 'TLBNumberType': {
        const bits = evaluate(ft.bits, vars)
        const n = toBig(v, path)
        if (ft.signed) b.storeInt(n, bits)
        else b.storeUint(n, bits)
        return
      }
      case 'TLBBoolType':
        if (ft.value === undefined) b.storeBit(v === true || v === 1 || v === '1')
        return
      case 'TLBBitsType':
        b.storeBits(parseBits(v, evaluate(ft.bits, vars), path))
        return
      case 'TLBNamedType': {
        const p = ctor.parametersMap.get(ft.name)
        if (p?.variable.type === 'Type') {
          const i = ctor.parameters.findIndex(x => x.variable.name === p.variable.name)
          if (args[i]) return this.fieldType(args[i]!, v, b, vars, ctor, args, path)
        }
        if (ft.name === 'Bool') {
          b.storeBit(v === true || v === 1)
          return
        }
        if (ft.name === 'Any') {
          b.storeSlice(toCell(v, path).beginParse(true))
          return
        }
        const t = this.types.get(ft.name)
        if (!t) throw new Error(`${path}: type ${ft.name} not found in the schema`)
        return this.type(t, v, b, ft.arguments ?? [], vars, path)
      }
      case 'TLBCoinsType':
        b.storeCoins(toBig(v, path))
        return
      case 'TLBAddressType':
        b.storeAddress(parseAddress(v, path))
        return
      case 'TLBCellType':
        // inline Cell: the rest of the cell (the decoder returns the remainder as a cell)
        b.storeSlice(toCell(v, path).beginParse(true))
        return
      case 'TLBCellInsideType': {
        if (ft.value.kind === 'TLBCellType') {
          b.storeRef(toCell(v, path))
          return
        }
        const ref = beginCell()
        this.fieldType(ft.value, v, ref, vars, ctor, args, path)
        b.storeRef(ref.endCell())
        return
      }
      case 'TLBHashmapType': {
        if (ft.extra) throw new Error(`${path}: encoding HashmapAugE is not supported`)
        const keyBits = evaluate(ft.key.expr, vars)
        const entries = Object.entries((v ?? {}) as Record<string, unknown>)
        const valueCodec = {
          serialize: (src: unknown, vb: Builder) => this.fieldType(ft.value, src, vb, new Map(vars), ctor, args, `${path}[…]`),
          parse: () => null
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys: any = keyBits > 32 ? Dictionary.Keys.BigUint(keyBits) : Dictionary.Keys.Uint(keyBits)
        const dict = Dictionary.empty<DictionaryKeyTypes, unknown>(keys, valueCodec)
        for (const [k, x] of entries) dict.set(keyBits > 32 ? toBig(k, `${path} key`) : Number(toBig(k, `${path} key`)), x)
        if (ft.directStore) {
          if (!entries.length) throw new Error(`${path}: a Hashmap (not HashmapE) cannot be empty`)
          b.storeDictDirect(dict)
        }
        else {
          b.storeDict(dict)
        }
        return
      }
      case 'TLBVarIntegerType': {
        const size = evaluate(ft.n, vars)
        if (ft.signed) b.storeVarInt(toBig(v, path), size)
        else b.storeVarUint(toBig(v, path), size)
        return
      }
      case 'TLBMultipleType': {
        const times = evaluate(ft.times, vars)
        if (!Array.isArray(v) || v.length !== times) throw new Error(`${path}: expected an array of ${times} items`)
        v.forEach((x, i) => this.fieldType(ft.value, x, b, vars, ctor, args, `${path}[${i}]`))
        return
      }
      case 'TLBCondType':
        if (evaluate(ft.condition, vars)) this.fieldType(ft.value, v, b, vars, ctor, args, path)
        return
      default:
        throw new Error(`${path}: encoding ${ft.kind.replace(/^TLB/, '')} fields is not supported`)
    }
  }
}

/** JSON (as produced by decodeBoc, possibly edited) → cell. The top-level `kind` picks the type. */
export function encodeJson(schema: Schema, json: string): Cell {
  let value: unknown
  try {
    value = JSON.parse(json)
  }
  catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  const kind = (value as { kind?: unknown } | null)?.kind
  if (typeof kind !== 'string') throw new Error('The top-level object needs a "kind", e.g. "InternalMsgBody_transfer"')
  const type = schema.types.get(typeOfKind(kind))
  if (!type) throw new Error(`Type ${typeOfKind(kind)} is not in the schema`)
  const b = beginCell()
  new Encoder(schema.types).type(type, value, b, [], new Map(), kind)
  return b.endCell()
}
