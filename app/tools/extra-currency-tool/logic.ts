// Extra currencies (ExtraCurrencyCollection, block.tlb): ids are uint32, amounts VarUInteger 32.
// toncenter and tonapi print ids as signed int32 (4294967279 shows up as -17); we normalize to uint32.
import type { Cell } from '@ton/core'
import { beginCell, Dictionary, storeExtraCurrency } from '@ton/core'

const U32 = 2 ** 32
/** VarUInteger 32 holds up to 31 bytes. */
const MAX_AMOUNT = (1n << 248n) - 1n

/** Accepts uint32 or the signed int32 form APIs print. Throws a readable Error. */
export function normalizeCurrencyId(id: number | string): number {
  const s = String(id).trim()
  if (!/^-?\d+$/.test(s)) throw new Error('Currency id must be a whole number')
  const n = Number(s)
  if (n < -(2 ** 31) || n >= U32) throw new Error('Currency id must be a 32-bit number')
  return n < 0 ? n + U32 : n
}

/** The signed int32 form toncenter / tonapi print. */
export function signedCurrencyId(id: number): number {
  return id >= 2 ** 31 ? id - U32 : id
}

export interface EcBalance {
  /** uint32 */
  id: number
  amount: bigint
  symbol: string
  decimals: number
}

/** tonapi /v2/accounts/{id} `extra_balance`. */
export function fromTonapi(extra: { amount: string, preview: { id: number, symbol: string, decimals: number } }[] | undefined): EcBalance[] {
  return (extra ?? []).map(e => ({ id: normalizeCurrencyId(e.preview.id), amount: BigInt(e.amount), symbol: e.preview.symbol, decimals: e.preview.decimals }))
}

/** toncenter v2 getAddressInformation `extra_currencies`. Decimals are not on chain; tonapi's default is 9. */
export function fromToncenter(extra: { id: number, amount: string }[] | undefined): EcBalance[] {
  return (extra ?? []).map(e => ({ id: normalizeCurrencyId(e.id), amount: BigInt(e.amount), symbol: `$${signedCurrencyId(normalizeCurrencyId(e.id))}`, decimals: 9 }))
}

export interface EcEntry { id: number, amount: bigint }

/** Validates and merges entries (same id twice is summed). */
export function mergeEntries(entries: EcEntry[]): Map<number, bigint> {
  const out = new Map<number, bigint>()
  for (const e of entries) {
    const id = normalizeCurrencyId(e.id)
    if (e.amount <= 0n) throw new Error(`Amount for currency ${id} must be greater than zero`)
    const sum = (out.get(id) ?? 0n) + e.amount
    if (sum > MAX_AMOUNT) throw new Error(`Amount for currency ${id} is too large`)
    out.set(id, sum)
  }
  return out
}

/** TonConnect `extraCurrency` field: { "<uint32 id>": "<amount>" }. */
export function tonConnectExtraCurrency(entries: EcEntry[]): Record<number, string> {
  return Object.fromEntries([...mergeEntries(entries)].map(([id, a]) => [id, a.toString()]))
}

/** ExtraCurrencyCollection as stored in a message (`other` field of CurrencyCollection): HashmapE 32 VarUInteger 32. */
export function extraCurrencyCollection(entries: EcEntry[]): Cell {
  return beginCell().store(storeExtraCurrency(Object.fromEntries(mergeEntries(entries)))).endCell()
}

/** Parses an ExtraCurrencyCollection cell back to uint32 id -> amount. */
export function parseExtraCurrencyCollection(cell: Cell): Map<number, bigint> {
  const d = cell.beginParse().loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.BigVarUint(5))
  return new Map(d.keys().map(k => [k, d.get(k)!]))
}

/** Does the connected wallet advertise extra currency support in its SendTransaction feature? */
export function walletSupportsExtraCurrency(features: unknown[] | undefined): boolean {
  return !!features?.some(f => typeof f === 'object' && f !== null && (f as { name?: string }).name === 'SendTransaction' && (f as { extraCurrencySupported?: boolean }).extraCurrencySupported === true)
}
