// TON fee math, bit-exact with the node (ton-blockchain/ton crypto/block/transaction.cpp):
// gas and storage round UP after >> 16, forward fees round UP, the sender's first_frac share rounds DOWN.
// Prices come from live config params 18 (storage), 20/21 (gas, mc/basechain), 24/25 (messages, mc/basechain).
// Shared by fee-calculator and storage-rent-estimator. Imports @ton/core: client / logic.ts only.
import type { Slice } from '@ton/core'
import { Cell, Dictionary } from '@ton/core'

export interface StoragePrice {
  utimeSince: number
  bitPricePs: bigint
  cellPricePs: bigint
  mcBitPricePs: bigint
  mcCellPricePs: bigint
}

export interface GasPrices {
  flatLimit: bigint
  flatPrice: bigint
  /** nano per gas unit * 2^16 */
  gasPrice: bigint
  gasLimit: bigint
  specialGasLimit: bigint
  gasCredit: bigint
  blockGasLimit: bigint
  freezeDueLimit: bigint
  deleteDueLimit: bigint
}

export interface MsgPrices {
  lumpPrice: bigint
  /** nano per bit * 2^16 */
  bitPrice: bigint
  /** nano per cell * 2^16 */
  cellPrice: bigint
  ihrPriceFactor: number
  firstFrac: number
  nextFrac: number
}

export interface FeeConfig {
  storage: StoragePrice[]
  gas: { masterchain: GasPrices, basechain: GasPrices }
  msg: { masterchain: MsgPrices, basechain: MsgPrices }
}

export type Workchain = 'basechain' | 'masterchain'

const toCell = (boc: string) => Cell.fromBase64(boc.trim())

/** Config param 18: `Hashmap 32 StoragePrices`, sorted by utime_since. */
export function parseStoragePrices(boc: string): StoragePrice[] {
  const value = {
    serialize: () => { throw new Error('read only') },
    parse: (s: Slice): StoragePrice => {
      if (s.loadUint(8) !== 0xcc) throw new Error('Config 18: bad storage_prices tag')
      return {
        utimeSince: s.loadUint(32),
        bitPricePs: s.loadUintBig(64),
        cellPricePs: s.loadUintBig(64),
        mcBitPricePs: s.loadUintBig(64),
        mcCellPricePs: s.loadUintBig(64)
      }
    }
  }
  return Dictionary.loadDirect(Dictionary.Keys.Uint(32), value, toCell(boc)).values().sort((a, b) => a.utimeSince - b.utimeSince)
}

/** Config param 20/21: `gas_flat_pfx#d1` wrapping `gas_prices_ext#de` (or the older `gas_prices#dd`). */
export function parseGasPrices(boc: string): GasPrices {
  const s = toCell(boc).beginParse()
  let flatLimit = 0n
  let flatPrice = 0n
  let tag = s.loadUint(8)
  if (tag === 0xd1) {
    flatLimit = s.loadUintBig(64)
    flatPrice = s.loadUintBig(64)
    tag = s.loadUint(8)
  }
  if (tag !== 0xde && tag !== 0xdd) throw new Error('Config 20/21: unsupported gas prices format')
  const gasPrice = s.loadUintBig(64)
  const gasLimit = s.loadUintBig(64)
  const specialGasLimit = tag === 0xde ? s.loadUintBig(64) : gasLimit
  return {
    flatLimit,
    flatPrice,
    gasPrice,
    gasLimit,
    specialGasLimit,
    gasCredit: s.loadUintBig(64),
    blockGasLimit: s.loadUintBig(64),
    freezeDueLimit: s.loadUintBig(64),
    deleteDueLimit: s.loadUintBig(64)
  }
}

/** Config param 24/25: `msg_forward_prices#ea`. */
export function parseMsgPrices(boc: string): MsgPrices {
  const s = toCell(boc).beginParse()
  if (s.loadUint(8) !== 0xea) throw new Error('Config 24/25: bad msg_forward_prices tag')
  return {
    lumpPrice: s.loadUintBig(64),
    bitPrice: s.loadUintBig(64),
    cellPrice: s.loadUintBig(64),
    ihrPriceFactor: s.loadUint(32),
    firstFrac: s.loadUint(16),
    nextFrac: s.loadUint(16)
  }
}

export const CONFIG_PARAMS = [18, 20, 21, 24, 25] as const

export function parseFeeConfig(params: Record<number, string>): FeeConfig {
  return {
    storage: parseStoragePrices(params[18]!),
    gas: { masterchain: parseGasPrices(params[20]!), basechain: parseGasPrices(params[21]!) },
    msg: { masterchain: parseMsgPrices(params[24]!), basechain: parseMsgPrices(params[25]!) }
  }
}

/** Picks params 18/20/21/24/25 out of a full config BOC (tonapi `raw`: ConfigParams = address + ^Hashmap 32 ^Cell, or the bare dict). */
export function paramsFromConfigBoc(hex: string): Record<number, string> {
  const root = Cell.fromBoc(Buffer.from(hex, 'hex'))[0]!
  const dictCell = root.bits.length === 256 && root.refs.length === 1 ? root.refs[0]! : root
  const dict = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), dictCell)
  const out: Record<number, string> = {}
  for (const id of CONFIG_PARAMS) {
    const c = dict.get(id)
    if (!c) throw new Error(`Config param ${id} missing`)
    out[id] = c.toBoc().toString('base64')
  }
  return out
}

type Getter = <T>(path: string, query?: Record<string, number>) => Promise<T>

/**
 * One tonapi request for the whole config (`useTonapi().get`); if that fails, five toncenter
 * `getConfigParam` calls (`useToncenter().v2`). Two hosts = two separate rate-limit queues.
 */
export async function fetchFeeConfig(tonapiGet: Getter, toncenterV2: Getter): Promise<FeeConfig> {
  try {
    const r = await tonapiGet<{ raw: string }>('blockchain/config')
    return parseFeeConfig(paramsFromConfigBoc(r.raw))
  }
  catch {
    const params: Record<number, string> = {}
    for (const id of CONFIG_PARAMS) {
      const r = await toncenterV2<{ config: { bytes: string } }>('getConfigParam', { config_id: id })
      params[id] = r.config.bytes
    }
    return parseFeeConfig(params)
  }
}

const ceil16 = (x: bigint) => (x + 0xffffn) >> 16n

/** Gas fee for `gasUsed` units (ComputePhaseConfig::compute_gas_price). */
export function gasFee(gasUsed: bigint, p: GasPrices): bigint {
  return gasUsed <= p.flatLimit ? p.flatPrice : p.flatPrice + ceil16(p.gasPrice * (gasUsed - p.flatLimit))
}

/** Forward fee for a message whose cells/bits exclude the root cell (MsgPrices::compute_fwd_fees). */
export function fwdFee(cells: bigint, bits: bigint, p: MsgPrices): bigint {
  return p.lumpPrice + ceil16(p.bitPrice * bits + p.cellPrice * cells)
}

/** Split of an internal message's forward fee: `action` stays with the sender's validators, `remaining` is written into the message. */
export function splitFwdFee(total: bigint, p: MsgPrices): { action: bigint, remaining: bigint } {
  const action = (total * BigInt(p.firstFrac)) >> 16n
  return { action, remaining: total - action }
}

/** Storage price in effect at `now` (the last entry whose utime_since <= now). */
export function currentStoragePrice(prices: StoragePrice[], now: number): StoragePrice | undefined {
  return prices.filter(p => p.utimeSince <= now).at(-1)
}

/**
 * Storage fee for an account of `cells`/`bits` that last paid at `lastPaid`, charged at `now`
 * (StoragePrices::compute_storage_fees: walks every price period, then one ceil(>> 16)).
 */
export function storageFee(o: { cells: bigint, bits: bigint, lastPaid: number, now: number, prices: StoragePrice[], masterchain?: boolean }): bigint {
  const { prices, now, lastPaid } = o
  if (now <= lastPaid || !lastPaid || !prices.length || now <= prices[0]!.utimeSince) return 0n
  let i = prices.length
  while (i && prices[i - 1]!.utimeSince > lastPaid) i--
  if (i) i--
  let upto = Math.max(lastPaid, prices[0]!.utimeSince)
  let total = 0n
  for (; i < prices.length && upto < now; i++) {
    const until = i < prices.length - 1 ? Math.min(now, prices[i + 1]!.utimeSince) : now
    if (upto < until) {
      const p = prices[i]!
      const perSec = o.cells * (o.masterchain ? p.mcCellPricePs : p.cellPricePs) + o.bits * (o.masterchain ? p.mcBitPricePs : p.bitPricePs)
      total += perSec * BigInt(until - upto)
    }
    upto = until
  }
  return ceil16(total)
}

/** Storage fee for `seconds` at a single price (projection; rounds up once, like the node). */
export function storageFeeFor(cells: bigint, bits: bigint, seconds: number, price: StoragePrice, masterchain = false): bigint {
  if (seconds <= 0) return 0n
  const perSec = cells * (masterchain ? price.mcCellPricePs : price.cellPricePs) + bits * (masterchain ? price.mcBitPricePs : price.bitPricePs)
  return ceil16(perSec * BigInt(Math.floor(seconds)))
}

/**
 * Unique cells/bits under `root`, the way the node counts a message (vm::CellStorageStat with dedup).
 * `skipRoot` drops the root cell itself: the lump price pays for a message's root.
 */
export function cellStats(root: Cell, skipRoot = true): { cells: bigint, bits: bigint } {
  const seen = new Set<string>()
  let cells = 0n
  let bits = 0n
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    cells++
    bits += BigInt(c.bits.length)
    c.refs.forEach(walk)
  }
  if (skipRoot) root.refs.forEach(walk)
  else walk(root)
  return { cells, bits }
}

export const SECONDS_PER_DAY = 86_400
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY
