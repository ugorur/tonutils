// Unix time <-> date, valid_until builder, chain clock and logical time (lt) helpers. Pure TS.

export type TimeKind = 'seconds' | 'milliseconds' | 'microseconds' | 'date'

export interface ParsedTime {
  /** Unix seconds (may be fractional for ms/µs input). */
  unix: number
  kind: TimeKind
}

const DATE_NO_TZ = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/

/**
 * Unix seconds / milliseconds / microseconds (by digit count) or a date string.
 * Dates without a timezone are read as UTC.
 */
export function parseTime(input: string): ParsedTime {
  const t = input.trim()
  const s = /^[\d\s_,]+$/.test(t) ? t.replace(/[\s_,]/g, '') : t
  if (!s) throw new Error('Enter a unix timestamp or a date')
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (s.length <= 11) return { unix: n, kind: 'seconds' }
    if (s.length <= 14) return { unix: n / 1e3, kind: 'milliseconds' }
    if (s.length <= 17) return { unix: n / 1e6, kind: 'microseconds' }
    throw new Error('Too many digits for a timestamp')
  }
  const ms = Date.parse(DATE_NO_TZ.test(s) ? `${s.replace(' ', 'T')}${s.length === 10 ? '' : 'Z'}` : s)
  if (Number.isNaN(ms)) throw new Error('Not a timestamp or a date. Try 1781481600, 2026-06-15 or 2026-06-15T12:00:00Z')
  return { unix: ms / 1e3, kind: 'date' }
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1]]

/** "in 5 minutes", "3 days ago". */
export function relative(unix: number, now: number): string {
  const d = unix - now
  for (const [unit, sec] of STEPS) {
    if (Math.abs(d) >= sec || unit === 'second') return rtf.format(Math.round(d / sec), unit)
  }
  return ''
}

export function describeTime(unix: number, now: number) {
  const date = new Date(unix * 1000)
  return {
    seconds: String(Math.floor(unix)),
    milliseconds: String(Math.floor(unix * 1000)),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' }),
    relative: relative(unix, now)
  }
}

export const VALID_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86_400 }
]

/** valid_until for a wallet external / TonConnect request: whole unix seconds. */
export function validUntil(base: number, ttlSeconds: number): number {
  return Math.floor(base) + Math.floor(ttlSeconds)
}

/** Logical time: unsigned 64-bit integer. */
export function parseLt(input: string): bigint | null {
  const s = input.trim().replace(/[\s_,]/g, '')
  if (!/^\d{1,20}$/.test(s)) return null
  const v = BigInt(s)
  return v < 2n ** 64n ? v : null
}

/** toncenter v3 /masterchainInfo and /blocks block (subset). */
export interface TcBlock {
  workchain: number
  shard: string
  seqno: number
  gen_utime: string | number
  start_lt: string
  end_lt: string
}

export interface ChainClock {
  seqno: number
  genUtime: number
  startLt: bigint
  endLt: bigint
}

export function toChainClock(b: TcBlock): ChainClock {
  return { seqno: b.seqno, genUtime: Number(b.gen_utime), startLt: BigInt(b.start_lt), endLt: BigInt(b.end_lt) }
}

/** Query for the first masterchain block whose start_lt >= lt (the block that committed it, or the next one). */
export function ltBlockQuery(lt: bigint) {
  return { workchain: -1, start_lt: lt.toString(), limit: 1, sort: 'asc' }
}
