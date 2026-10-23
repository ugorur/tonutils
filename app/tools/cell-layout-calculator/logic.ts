// Bit budget of a cell layout (TL-B sizes) plus storage / forward fees at the current mainnet config.
import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'

export type FieldType = 'uint' | 'int' | 'bool' | 'coins' | 'varuint' | 'varint' | 'address' | 'address-opt' | 'bits' | 'ref' | 'maybe-ref' | 'dict'

export interface FieldTypeInfo {
  label: string
  /** Needs a size parameter N. */
  param?: { label: string, min: number, max: number, default: number }
  hint: string
}

export const FIELD_TYPES: Record<FieldType, FieldTypeInfo> = {
  'uint': { label: 'uintN', param: { label: 'N bits', min: 1, max: 256, default: 32 }, hint: 'Unsigned integer, exactly N bits.' },
  'int': { label: 'intN', param: { label: 'N bits', min: 1, max: 257, default: 32 }, hint: 'Signed integer, exactly N bits.' },
  'bool': { label: 'Bool', hint: '1 bit.' },
  'coins': { label: 'Coins', hint: `VarUInteger 16: 4-bit byte length + up to 15 bytes (4–124 bits). Used for ${COIN_SYMBOL} (formerly ${COIN_FORMER}) and jetton amounts.` },
  'varuint': { label: 'VarUInteger n', param: { label: 'n', min: 2, max: 32, default: 32 }, hint: 'ceil(log2 n) length bits + up to n−1 bytes.' },
  'varint': { label: 'VarInteger n', param: { label: 'n', min: 2, max: 32, default: 32 }, hint: 'Signed; same size as VarUInteger n.' },
  'address': { label: 'Address', hint: 'MsgAddressInt addr_std: 2 + 1 + 8 + 256 = 267 bits.' },
  'address-opt': { label: 'Address or none', hint: 'MsgAddress: addr_none is 2 bits, a standard address 267 bits.' },
  'bits': { label: 'bitsN', param: { label: 'N bits', min: 1, max: 1023, default: 256 }, hint: 'Raw bits, e.g. bits256 for a hash or public key.' },
  'ref': { label: '^Cell', hint: 'A reference to another cell: 0 bits, 1 ref.' },
  'maybe-ref': { label: 'Maybe ^Cell', hint: '1 bit + an optional ref. Also fits Either X ^X stored as a ref (forward_payload).' },
  'dict': { label: 'Dictionary', hint: 'HashmapE: 1 bit + an optional ref to the root.' }
}

export interface Field {
  name: string
  type: FieldType
  /** Size parameter for uint / int / bits / varuint / varint. */
  n?: number
}

export interface FieldSize { minBits: number, maxBits: number, minRefs: number, maxRefs: number }

export function fieldSize(f: Field): FieldSize {
  const p = FIELD_TYPES[f.type].param
  const n = f.n ?? p?.default ?? 0
  if (p && (!Number.isInteger(n) || n < p.min || n > p.max)) throw new Error(`${f.name || f.type}: ${p.label} must be ${p.min}–${p.max}`)
  const s = (minBits: number, maxBits = minBits, minRefs = 0, maxRefs = minRefs): FieldSize => ({ minBits, maxBits, minRefs, maxRefs })
  switch (f.type) {
    case 'uint':
    case 'int':
    case 'bits': return s(n)
    case 'bool': return s(1)
    case 'coins': return s(4, 4 + 8 * 15)
    case 'varuint':
    case 'varint': {
      const len = Math.ceil(Math.log2(n))
      return s(len, len + 8 * (n - 1))
    }
    case 'address': return s(267)
    case 'address-opt': return s(2, 267)
    case 'ref': return s(0, 0, 1)
    case 'maybe-ref':
    case 'dict': return s(1, 1, 0, 1)
  }
}

export const MAX_BITS = 1023
export const MAX_REFS = 4

export interface CellPlan { fields: { field: Field, size: FieldSize }[], maxBits: number, maxRefs: number }

export interface Layout {
  fields: { field: Field, size: FieldSize }[]
  total: FieldSize
  fits: boolean
  /** Worst-case packing; one cell when it fits. Cell i > 0 hangs off the last ref of cell i − 1. */
  plan: CellPlan[]
}

/**
 * ponytail: greedy split in declared order, worst-case sizes, one ref per cell reserved for the continuation.
 * Good enough as a suggestion; a real layout may group hot fields differently.
 */
export function computeLayout(fields: Field[]): Layout {
  const sized = fields.map(field => ({ field, size: fieldSize(field) }))
  const total = sized.reduce<FieldSize>((t, { size }) => ({
    minBits: t.minBits + size.minBits,
    maxBits: t.maxBits + size.maxBits,
    minRefs: t.minRefs + size.minRefs,
    maxRefs: t.maxRefs + size.maxRefs
  }), { minBits: 0, maxBits: 0, minRefs: 0, maxRefs: 0 })
  const fits = total.maxBits <= MAX_BITS && total.maxRefs <= MAX_REFS
  if (fits) return { fields: sized, total, fits, plan: [{ fields: sized, maxBits: total.maxBits, maxRefs: total.maxRefs }] }

  const plan: CellPlan[] = [{ fields: [], maxBits: 0, maxRefs: 0 }]
  for (const item of sized) {
    let cur = plan.at(-1)!
    if (cur.maxBits + item.size.maxBits > MAX_BITS || cur.maxRefs + item.size.maxRefs > MAX_REFS - 1) {
      cur.maxRefs++ // the continuation ref
      cur = { fields: [], maxBits: 0, maxRefs: 0 }
      plan.push(cur)
    }
    cur.fields.push(item)
    cur.maxBits += item.size.maxBits
    cur.maxRefs += item.size.maxRefs
  }
  return { fields: sized, total, fits, plan }
}

// ---------------------------------------------------------------- fees

/** Mainnet config, read from tonapi /v2/blockchain/config on 2026-10-22. */
export const MAINNET_PRICES = {
  /** ConfigParam 18, entry valid since utime 1777500000 (basechain bit price is 0). */
  storage: { bitPricePs: 0n, cellPricePs: 135n, mcBitPricePs: 1000n, mcCellPricePs: 500000n },
  /** ConfigParam 25 (basechain) and 24 (masterchain) msg_forward_prices. */
  forward: {
    basechain: { lumpPrice: 66667n, bitPrice: 4369067n, cellPrice: 436906667n, firstFrac: 21845n },
    masterchain: { lumpPrice: 10000000n, bitPrice: 655360000n, cellPrice: 65536000000n, firstFrac: 21845n }
  }
} as const

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b
const TWO_16 = 65536n

export type Chain = 'basechain' | 'masterchain'

/** Storage fee in nanoGRAM for keeping `bits` / `cells` for `seconds`. */
export function storageFee(bits: number, cells: number, seconds: number, chain: Chain = 'basechain'): bigint {
  const p = MAINNET_PRICES.storage
  const [bp, cp] = chain === 'masterchain' ? [p.mcBitPricePs, p.mcCellPricePs] : [p.bitPricePs, p.cellPricePs]
  return ceilDiv((BigInt(bits) * bp + BigInt(cells) * cp) * BigInt(seconds), TWO_16)
}

/**
 * Forward fee of a message whose cells (excluding the root message cell) total `bits` / `cells`.
 * `total` is what the sender pays; `fwdFee` is what the message carries (total minus the first_frac share for validators).
 */
export function forwardFee(bits: number, cells: number, chain: Chain = 'basechain'): { total: bigint, fwdFee: bigint } {
  const p = MAINNET_PRICES.forward[chain]
  const total = p.lumpPrice + ceilDiv(p.bitPrice * BigInt(bits) + p.cellPrice * BigInt(cells), TWO_16)
  return { total, fwdFee: total - (total * p.firstFrac) / TWO_16 }
}

export const SECONDS_PER_YEAR = 365 * 24 * 3600

export interface FeeEstimate {
  cells: number
  bits: number
  storagePerYear: bigint
  /** Forward fee when the layout is a message body stored as a ref (so every planned cell is counted). */
  forward: { total: bigint, fwdFee: bigint }
}

/** Worst-case fees for the planned cells. Contents behind ^Cell / dict refs are not known, so not counted. */
export function estimateFees(layout: Layout, chain: Chain = 'basechain'): FeeEstimate {
  const cells = layout.plan.length
  const bits = layout.plan.reduce((s, c) => s + c.maxBits, 0)
  return {
    cells,
    bits,
    storagePerYear: storageFee(bits, cells, SECONDS_PER_YEAR, chain),
    // A body only goes inline when it fits next to the ~600-bit internal message header, so assume a ref (worst case).
    forward: forwardFee(bits, cells, chain)
  }
}

export const PRESETS: { label: string, fields: Field[] }[] = [
  {
    label: 'Jetton wallet storage (TEP-74)',
    fields: [
      { name: 'balance', type: 'coins' },
      { name: 'owner_address', type: 'address' },
      { name: 'jetton_master_address', type: 'address' },
      { name: 'jetton_wallet_code', type: 'ref' }
    ]
  },
  {
    label: 'Jetton transfer body (TEP-74)',
    fields: [
      { name: 'op', type: 'uint', n: 32 },
      { name: 'query_id', type: 'uint', n: 64 },
      { name: 'amount', type: 'coins' },
      { name: 'destination', type: 'address' },
      { name: 'response_destination', type: 'address-opt' },
      { name: 'custom_payload', type: 'maybe-ref' },
      { name: 'forward_ton_amount', type: 'coins' },
      { name: 'forward_payload', type: 'maybe-ref' }
    ]
  },
  {
    label: 'NFT item storage (TEP-62)',
    fields: [
      { name: 'index', type: 'uint', n: 64 },
      { name: 'collection_address', type: 'address' },
      { name: 'owner_address', type: 'address' },
      { name: 'content', type: 'ref' }
    ]
  },
  {
    label: 'Escrow (too big for one cell)',
    fields: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'arbiter', type: 'address' },
      { name: 'jetton_wallet', type: 'address' },
      { name: 'amount', type: 'coins' },
      { name: 'fee_bps', type: 'uint', n: 16 },
      { name: 'deadline', type: 'uint', n: 32 },
      { name: 'state', type: 'uint', n: 8 },
      { name: 'terms', type: 'ref' }
    ]
  }
]
