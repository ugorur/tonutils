// TON Storage providers (tonapi /v2/storage/providers) and the storage contract's pricing formula.
// Pure TS, no Vue.

export interface StorageProvider {
  address: string
  accept_new_contracts: boolean
  /** nanoGRAM per MiB per day. */
  rate_per_mb_day: number
  /** Longest gap between storage proofs the provider gets paid for, seconds. */
  max_span: number
  minimal_file_size: number
  maximal_file_size: number
}

export const MiB = 1024 * 1024

/**
 * tonapi lists every contract that answers get_storage_params, including unrelated contracts with
 * nonsense values (e.g. a 52-byte maximum file). Keep providers that take new contracts, at least 1 MiB,
 * and charge something (a zero rate means the provider is never paid, so it is a test or a misconfiguration).
 */
export function isUsable(p: StorageProvider): boolean {
  return p.accept_new_contracts && p.rate_per_mb_day > 0 && p.maximal_file_size >= MiB && p.maximal_file_size >= p.minimal_file_size
}

export function accepts(p: StorageProvider, bytes: number): boolean {
  return bytes >= p.minimal_file_size && bytes <= p.maximal_file_size
}

/**
 * What the storage contract pays the provider for `seconds` of storage, in nano:
 * muldiv(file_size * rate_per_mb_day, span, 24 * 60 * 60 * 1024 * 1024) (storage-contract.fc).
 */
export function storageCost(bytes: bigint, ratePerMbDay: bigint, seconds: bigint): bigint {
  return (bytes * ratePerMbDay * seconds) / (86400n * 1048576n)
}

export const UNITS = { KB: 1024, MB: MiB, GB: 1024 * MiB, TB: 1024 * 1024 * MiB } as const
export type SizeUnit = keyof typeof UNITS

/** "1.5" + "GB" → bytes (binary units, as the contract counts MiB). Null for invalid input. */
export function toBytes(size: string, unit: SizeUnit): number | null {
  const n = Number(size.trim())
  if (!size.trim() || !Number.isFinite(n) || n <= 0) return null
  return Math.ceil(n * UNITS[unit])
}

/** 1073741824 → "1 GiB". */
export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  let v = b / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${units[i]}`
}

export interface Quote { provider: StorageProvider, cost: bigint }

/** Usable providers that accept the file, cheapest first. */
export function quotes(list: StorageProvider[], bytes: number, days: number): Quote[] {
  const secs = BigInt(Math.round(days * 86400))
  return list
    .filter(p => isUsable(p) && accepts(p, bytes))
    .map(p => ({ provider: p, cost: storageCost(BigInt(bytes), BigInt(p.rate_per_mb_day), secs) }))
    .sort((a, b) => (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : 0))
}
