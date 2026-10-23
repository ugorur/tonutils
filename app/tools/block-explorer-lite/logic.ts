// Masterchain block / shard inspector: shard id arithmetic and the toncenter v3 block shapes. Pure TS.

export interface V3Block {
  workchain: number
  /** 64-bit shard id, 16 hex digits. */
  shard: string
  seqno: number
  root_hash: string
  file_hash: string
  gen_utime: string
  start_lt: string
  end_lt: string
  tx_count: number
  key_block: boolean
  after_split: boolean
  after_merge: boolean
  before_split: boolean
  want_split: boolean
  want_merge: boolean
  rand_seed: string
  prev_key_block_seqno: number
  global_id: number
  masterchain_block_ref?: { workchain: number, shard: string, seqno: number } | null
}

/**
 * A shard id is the shard's bit prefix, then a single 1 bit, then zeros: 0x8000000000000000 is the whole
 * workchain (empty prefix), 0xC000… holds accounts starting with bit 1, 0xE800… holds prefix 1110.
 */
export function shardPrefix(shardHex: string): { bits: string, depth: number } {
  const id = BigInt.asUintN(64, BigInt(`0x${shardHex}`))
  if (id === 0n) throw new Error('Invalid shard id 0')
  const bin = id.toString(2).padStart(64, '0')
  const depth = bin.lastIndexOf('1')
  return { bits: bin.slice(0, depth), depth }
}

/** Shard id as 16 uppercase hex digits, from the signed 64-bit decimal toncenter v2 / liteservers return. */
export const shardHex = (signedDecimal: string) => BigInt.asUintN(64, BigInt(signedDecimal)).toString(16).toUpperCase().padStart(16, '0')

/** First `n` bits of a raw account id (64 hex digits). */
export function accountBits(accountHex: string, n = 64): string {
  return BigInt(`0x${accountHex.slice(0, 16)}`).toString(2).padStart(64, '0').slice(0, n)
}

/** Does this account (raw `wc:hex`) live in this shard? */
export function inShard(rawAddress: string, workchain: number, shardHex: string): boolean {
  const [wc, hex] = rawAddress.split(':')
  if (Number(wc) !== workchain || !hex) return false
  const { bits, depth } = shardPrefix(shardHex)
  return accountBits(hex, depth) === bits
}

/** The shard (from a list of shards of one masterchain state) holding the account, or null. */
export function shardOf<T extends { workchain: number, shard: string }>(rawAddress: string, shards: T[]): T | null {
  return shards.find(s => inShard(rawAddress, s.workchain, s.shard)) ?? null
}

/** Readable shard label, e.g. `0:1110*` (or `0:*` for an unsplit workchain). */
export function shardLabel(workchain: number, shardHex: string): string {
  return `${workchain}:${shardPrefix(shardHex).bits}*`
}

/** Share of the workchain's address space a shard covers, e.g. 0.0625 for depth 4. */
export const shardCoverage = (shardHex: string) => 1 / 2 ** shardPrefix(shardHex).depth

/** Short "12 s ago" style age. */
export function age(unix: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(now - unix))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/** Masterchain seqno from a plain number or a block id like `(-1,8000000000000000,40000000)`. */
export function parseSeqno(input: string): number | null {
  const s = input.trim().replace(/[\s_]/g, '')
  const m = /^\(?-1,8000000000000000,(\d+)\)?$/i.exec(s) ?? /^(\d+)$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
