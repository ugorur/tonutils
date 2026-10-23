// TVM stack in every format TON tooling uses, via @ton/core TupleItem[] as the common model.
import type { TupleItem } from '@ton/core'
import { Address, beginCell, Cell, parseTuple, serializeTuple } from '@ton/core'
import { cellAsAddress, hashHex, parseCell, parseInteger, toB64, toHexNum } from '~/lib/boc-advanced/cells'

export type StackFormat = 'toncenter-v2' | 'toncenter-v3' | 'tonapi' | 'tonapi-args' | 'core' | 'boc'

export const FORMAT_LABELS: Record<StackFormat, string> = {
  'toncenter-v2': 'toncenter v2 ([["num","0x…"], …])',
  'toncenter-v3': 'toncenter v3 ({type, value})',
  'tonapi': 'tonapi result ({type, num|cell|slice|tuple})',
  'tonapi-args': 'tonapi get-method args ({args: [{type, value}]})',
  'core': '@ton/core TupleItem JSON',
  'boc': 'Serialized VmStack (BOC)'
}

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

const cellFrom = (v: unknown, what: string): Cell => {
  if (v && typeof v === 'object' && typeof (v as Json).bytes === 'string') return parseCell((v as Json).bytes, what)
  if (typeof v !== 'string') throw new Error(`${what}: expected a BOC string`)
  return parseCell(v, what)
}

/** toncenter "list" is tonlib's flattened Lisp list (a, (b, (c, null))). Rebuild the nesting tonapi/TVM use. */
function lispList(items: TupleItem[]): TupleItem {
  let acc: TupleItem = { type: 'null' }
  for (let i = items.length - 1; i >= 0; i--) acc = { type: 'tuple', items: [items[i]!, acc] }
  return acc
}

// ---------------------------------------------------------------- parsers

function fromV2Entry(e: Json): TupleItem {
  // nested tonlib objects inside tuples/lists
  switch (e?.['@type']) {
    case 'tvm.stackEntryNumber': return { type: 'int', value: parseInteger(e.number.number, 'number') }
    case 'tvm.stackEntryCell': return { type: 'cell', cell: cellFrom(e.cell, 'cell') }
    case 'tvm.stackEntrySlice': return { type: 'slice', cell: cellFrom(e.slice, 'slice') }
    case 'tvm.stackEntryTuple': return { type: 'tuple', items: e.tuple.elements.map(fromV2Entry) }
    case 'tvm.stackEntryList': return lispList(e.list.elements.map(fromV2Entry))
  }
  throw new Error(`Unsupported toncenter v2 entry ${JSON.stringify(e).slice(0, 80)}`)
}

function fromV2(stack: Json[]): TupleItem[] {
  return stack.map((e) => {
    if (!Array.isArray(e)) throw new Error('toncenter v2 entries are [type, value] pairs')
    const [t, v] = e
    switch (t) {
      case 'num': return { type: 'int', value: parseInteger(v, 'num') }
      case 'null': return { type: 'null' }
      case 'nan': return { type: 'nan' }
      case 'cell': case 'tvm.Cell': return { type: 'cell', cell: cellFrom(v, t) }
      case 'slice': case 'tvm.Slice': return { type: 'slice', cell: cellFrom(v, t) }
      case 'builder': case 'tvm.Builder': return { type: 'builder', cell: cellFrom(v, t) }
      case 'tuple': return { type: 'tuple', items: v.elements.map(fromV2Entry) }
      case 'list': return lispList(v.elements.map(fromV2Entry))
    }
    throw new Error(`Unknown toncenter v2 type "${t}"`)
  }) as TupleItem[]
}

function fromV3(e: Json): TupleItem {
  switch (e?.type) {
    case 'num': return { type: 'int', value: parseInteger(e.value, 'num') }
    case 'null': return { type: 'null' }
    case 'nan': return { type: 'nan' }
    case 'cell': return { type: 'cell', cell: cellFrom(e.value, 'cell') }
    case 'slice': return { type: 'slice', cell: cellFrom(e.value, 'slice') }
    case 'builder': return { type: 'builder', cell: cellFrom(e.value, 'builder') }
    case 'tuple': return { type: 'tuple', items: e.value.map(fromV3) }
    case 'list': return lispList(e.value.map(fromV3))
  }
  throw new Error(`Unknown toncenter v3 entry ${JSON.stringify(e).slice(0, 80)}`)
}

function fromTonapi(e: Json): TupleItem {
  switch (e?.type) {
    case 'num': return { type: 'int', value: parseInteger(e.num, 'num') }
    case 'null': return { type: 'null' }
    case 'nan': return { type: 'nan' }
    case 'cell': return { type: 'cell', cell: parseCell(e.cell, 'cell') }
    case 'slice': return { type: 'slice', cell: parseCell(e.slice, 'slice') }
    case 'tuple': return { type: 'tuple', items: e.tuple.map(fromTonapi) }
  }
  throw new Error(`Unknown tonapi entry ${JSON.stringify(e).slice(0, 80)}`)
}

function fromTonapiArg(e: Json): TupleItem {
  switch (e?.type) {
    case 'nan': return { type: 'nan' }
    case 'null': return { type: 'null' }
    case 'tinyint': case 'int257': return { type: 'int', value: parseInteger(e.value, e.type) }
    case 'slice': return { type: 'slice', cell: beginCell().storeAddress(Address.parse(e.value)).endCell() }
    case 'cell_boc_base64': return { type: 'cell', cell: parseCell(e.value, 'cell') }
    case 'slice_boc_hex': return { type: 'slice', cell: parseCell(e.value, 'slice') }
  }
  throw new Error(`Unknown tonapi arg ${JSON.stringify(e).slice(0, 80)}`)
}

function fromCore(e: Json): TupleItem {
  switch (e?.type) {
    case 'int': return { type: 'int', value: parseInteger(e.value, 'int') }
    case 'null': return { type: 'null' }
    case 'nan': return { type: 'nan' }
    case 'cell': case 'slice': case 'builder': return { type: e.type, cell: parseCell(e.cell, e.type) }
    case 'tuple': return { type: 'tuple', items: e.items.map(fromCore) }
  }
  throw new Error(`Unknown TupleItem ${JSON.stringify(e).slice(0, 80)}`)
}

/** Finds the stack inside a pasted value: bare arrays, whole API responses ({stack}, {result: {stack}}), tonapi {args}. */
function unwrap(j: Json): { list: Json[], hint?: StackFormat } {
  if (Array.isArray(j)) return { list: j }
  if (j && typeof j === 'object') {
    if (Array.isArray(j.args)) return { list: j.args, hint: 'tonapi-args' }
    if (Array.isArray(j.stack)) return { list: j.stack }
    if (Array.isArray(j.result?.stack)) return { list: j.result.stack }
  }
  throw new Error('Paste a stack array, a full get-method response, tonapi {"args": […]} or a VmStack BOC')
}

export function detectFormat(input: string): StackFormat {
  const s = input.trim()
  if (!/^[[{]/.test(s)) return 'boc'
  let j: Json
  try {
    j = JSON.parse(s)
  }
  catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  const { list, hint } = unwrap(j)
  if (hint) return hint
  // Look at every entry: {type: 'cell', cell} is both tonapi and @ton/core, so the first entry alone can mislead.
  if (list.some(Array.isArray)) return 'toncenter-v2'
  const objs = list.filter(e => e && typeof e === 'object')
  if (objs.some(e => e.type === 'int' || 'items' in e || (e.type !== 'cell' && 'cell' in e))) return 'core'
  if (objs.some(e => 'num' in e || 'slice' in e || 'tuple' in e || 'cell' in e)) return 'tonapi'
  if (objs.some(e => 'value' in e)) return 'toncenter-v3'
  // empty, or only null/nan entries: every JSON format reads those the same way
  if (list.every(e => e && typeof e === 'object' && (e.type === 'null' || e.type === 'nan'))) return 'toncenter-v3'
  throw new Error('Could not recognise this stack format')
}

export function parseStack(input: string, format: StackFormat | 'auto' = 'auto'): { format: StackFormat, items: TupleItem[] } {
  const f = format === 'auto' ? detectFormat(input) : format
  if (f === 'boc') {
    const cell = parseCell(input, 'VmStack BOC')
    try {
      return { format: f, items: parseTuple(cell) }
    }
    catch (e) {
      throw new Error(`Not a serialized VmStack: ${(e as Error).message}`)
    }
  }
  let json: Json
  try {
    json = JSON.parse(input.trim())
  }
  catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  const { list } = unwrap(json)
  const parse = { 'toncenter-v2': null, 'toncenter-v3': fromV3, 'tonapi': fromTonapi, 'tonapi-args': fromTonapiArg, 'core': fromCore }[f]
  try {
    return { format: f, items: parse ? list.map(parse) : fromV2(list) }
  }
  catch (e) {
    throw new Error(`${FORMAT_LABELS[f]}: ${(e as Error).message}`)
  }
}

// ---------------------------------------------------------------- serializers

/** toncenter v2 result form. Null is tonlib's empty list. */
function toV2Entry(i: TupleItem): Json {
  switch (i.type) {
    case 'int': return { '@type': 'tvm.stackEntryNumber', 'number': { '@type': 'tvm.numberDecimal', 'number': i.value.toString() } }
    case 'cell': case 'builder': return { '@type': 'tvm.stackEntryCell', 'cell': { '@type': 'tvm.cell', 'bytes': toB64(i.cell) } }
    case 'slice': return { '@type': 'tvm.stackEntrySlice', 'slice': { '@type': 'tvm.slice', 'bytes': toB64(i.cell) } }
    case 'tuple': return { '@type': 'tvm.stackEntryTuple', 'tuple': { '@type': 'tvm.tuple', 'elements': i.items.map(toV2Entry) } }
    case 'null': return { '@type': 'tvm.stackEntryList', 'list': { '@type': 'tvm.list', 'elements': [] } }
    case 'nan': throw new Error('NaN cannot be expressed in toncenter v2 format')
  }
}

export function toToncenterV2(items: TupleItem[], input = false): Json[] {
  return items.map((i) => {
    switch (i.type) {
      case 'int': return ['num', toHexNum(i.value)]
      case 'cell': return input ? ['tvm.Cell', toB64(i.cell)] : ['cell', { bytes: toB64(i.cell) }]
      case 'slice': return input ? ['tvm.Slice', toB64(i.cell)] : ['slice', { bytes: toB64(i.cell) }]
      case 'builder':
        if (input) throw new Error('toncenter v2 runGetMethod does not take builder arguments (pass it as a cell)')
        return ['builder', { bytes: toB64(i.cell) }]
      case 'null': return ['list', { '@type': 'tvm.list', 'elements': [] }]
      case 'tuple':
        if (input) throw new Error('toncenter v2 runGetMethod does not take tuple arguments')
        return ['tuple', { '@type': 'tvm.tuple', 'elements': i.items.map(toV2Entry) }]
      case 'nan': throw new Error('NaN cannot be expressed in toncenter v2 format')
    }
  })
}

/** toncenter v3 result form; with input=true, the POST stack (v3 only accepts num, cell and slice arguments). */
export function toToncenterV3(items: TupleItem[], input = false): Json[] {
  return items.map((i): Json => {
    if (input && i.type !== 'int' && i.type !== 'cell' && i.type !== 'slice') throw new Error(`toncenter v3 runGetMethod only takes int, cell and slice arguments, not ${i.type}`)
    switch (i.type) {
      case 'int': return { type: 'num', value: toHexNum(i.value) }
      case 'cell': case 'slice': case 'builder': return { type: i.type, value: toB64(i.cell) }
      case 'tuple': return { type: 'tuple', value: toToncenterV3(i.items) }
      case 'null': return { type: 'list', value: [] }
      case 'nan': return { type: 'nan' }
    }
  })
}

/** tonapi prints BOCs as hex without CRC (b5ee9c7201…). */
const tonapiHex = (c: Cell) => c.toBoc({ idx: false, crc32: false }).toString('hex')

export function toTonapi(items: TupleItem[]): Json[] {
  return items.map((i): Json => {
    switch (i.type) {
      case 'int': return { type: 'num', num: toHexNum(i.value) }
      case 'cell': case 'builder': return { type: 'cell', cell: tonapiHex(i.cell) }
      case 'slice': return { type: 'slice', slice: tonapiHex(i.cell) }
      case 'tuple': return { type: 'tuple', tuple: toTonapi(i.items) }
      case 'null': return { type: 'null' }
      case 'nan': return { type: 'nan' }
    }
  })
}

const INT64_MIN = -(1n << 63n)
const INT64_MAX = (1n << 63n) - 1n

/** Body for POST tonapi /v2/blockchain/accounts/{id}/methods/{name}. */
export function toTonapiArgs(items: TupleItem[]): { args: Json[] } {
  return {
    args: items.map((i) => {
      switch (i.type) {
        case 'int':
          if (i.value >= INT64_MIN && i.value <= INT64_MAX) return { type: 'tinyint', value: i.value.toString() }
          if (i.value < 0n) throw new Error('tonapi only takes negative numbers that fit in 64 bits')
          return { type: 'int257', value: toHexNum(i.value) }
        case 'cell': return { type: 'cell_boc_base64', value: toB64(i.cell) }
        case 'slice': {
          const a = cellAsAddress(i.cell)
          return a ? { type: 'slice', value: a.toRawString() } : { type: 'slice_boc_hex', value: tonapiHex(i.cell) }
        }
        // tonapi requires these literal values: {type: 'null'} alone is rejected with "value (field required)"
        case 'null': return { type: 'null', value: 'Null' }
        case 'nan': return { type: 'nan', value: 'NaN' }
        default: throw new Error(`tonapi arguments cannot be a ${i.type}`)
      }
    })
  }
}

export function toCore(items: TupleItem[]): Json[] {
  return items.map((i): Json => {
    switch (i.type) {
      case 'int': return { type: 'int', value: i.value.toString() }
      case 'cell': case 'slice': case 'builder': return { type: i.type, cell: toB64(i.cell) }
      case 'tuple': return { type: 'tuple', items: toCore(i.items) }
      default: return { type: i.type }
    }
  })
}

export function toBoc(items: TupleItem[]): string {
  return toB64(serializeTuple(items))
}

/** All output formats; a format that cannot express the stack carries its error instead. */
export function convertAll(items: TupleItem[]) {
  const safe = (f: () => unknown) => {
    try {
      const v = f()
      return { ok: true as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }
    }
    catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }
  return {
    'toncenter-v2': safe(() => toToncenterV2(items)),
    'toncenter-v2-input': safe(() => toToncenterV2(items, true)),
    'toncenter-v3': safe(() => toToncenterV3(items)),
    'toncenter-v3-input': safe(() => toToncenterV3(items, true)),
    'tonapi': safe(() => toTonapi(items)),
    'tonapi-args': safe(() => toTonapiArgs(items)),
    'core': safe(() => toCore(items)),
    'boc': safe(() => toBoc(items))
  }
}

// ---------------------------------------------------------------- readable view

export interface ReadableItem {
  index: string
  type: string
  value: string
  extra?: string
  children?: ReadableItem[]
}

export function readable(items: TupleItem[], testOnly = false, prefix = ''): ReadableItem[] {
  return items.map((i, n): ReadableItem => {
    const index = prefix ? `${prefix}.${n}` : String(n)
    switch (i.type) {
      case 'int': return { index, type: 'int', value: i.value.toString(), extra: toHexNum(i.value) }
      case 'cell': case 'slice': case 'builder': {
        const a = cellAsAddress(i.cell)
        return a
          ? { index, type: `${i.type} (address)`, value: a.toString({ testOnly }), extra: a.toRawString() }
          : { index, type: i.type, value: toB64(i.cell), extra: `${i.cell.bits.length} bits, ${i.cell.refs.length} refs, hash ${hashHex(i.cell)}` }
      }
      case 'tuple': return { index, type: `tuple (${i.items.length})`, value: '', children: readable(i.items, testOnly, index) }
      default: return { index, type: i.type, value: i.type === 'null' ? 'null' : 'NaN' }
    }
  })
}

// ---------------------------------------------------------------- argument builder

export type ArgType = 'int' | 'address' | 'cell' | 'slice' | 'null'
export interface ArgRow { type: ArgType, value: string }

export function argsToItems(rows: ArgRow[]): TupleItem[] {
  return rows.map((r, n): TupleItem => {
    const what = `Argument ${n + 1}`
    switch (r.type) {
      case 'int': return { type: 'int', value: parseInteger(r.value, what) }
      case 'address': {
        let a: Address
        try {
          a = Address.parse(r.value.trim())
        }
        catch {
          throw new Error(`${what}: not a TON address`)
        }
        return { type: 'slice', cell: beginCell().storeAddress(a).endCell() }
      }
      case 'cell': return { type: 'cell', cell: parseCell(r.value, `${what} (cell BOC)`) }
      case 'slice': return { type: 'slice', cell: parseCell(r.value, `${what} (slice BOC)`) }
      case 'null': return { type: 'null' }
    }
  })
}
