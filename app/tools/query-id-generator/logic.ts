// query_id (uint64) generator and decoder. Pure TS; randomness from Web Crypto.

export const UINT64_MAX = 2n ** 64n - 1n

export type GenMode = 'random' | 'ms' | 'seconds' | 'expiry-shift' | 'sequential'

export const GEN_MODES: { value: GenMode, label: string, description: string }[] = [
  { value: 'random', label: 'Random 64-bit', description: 'Cryptographically random. Best default: no collisions, reveals nothing.' },
  { value: 'ms', label: 'Date.now() (ms)', description: 'Milliseconds since 1970. Common in dApps; sortable, but two sends in the same ms collide.' },
  { value: 'seconds', label: 'Unix seconds', description: 'Seconds since 1970. Collides for sends within the same second.' },
  { value: 'expiry-shift', label: '(expiry << 32) | random', description: 'Highload wallet v2 layout: the high 32 bits are a unix expiry time, the low 32 bits random.' },
  { value: 'sequential', label: 'Sequential', description: 'Counter from a start value. Simple to track; you must store the last one used.' }
]

export function randomU64(): bigint {
  return crypto.getRandomValues(new BigUint64Array(1))[0]!
}

function randomU32(): bigint {
  return BigInt(crypto.getRandomValues(new Uint32Array(1))[0]!)
}

export interface GenOptions {
  mode: GenMode
  count: number
  /** Milliseconds since epoch (injectable for tests). */
  nowMs: number
  /** For 'expiry-shift': seconds added to now for the expiry. */
  ttl?: number
  /** For 'sequential'. */
  start?: bigint
}

export function generate(o: GenOptions): bigint[] {
  const n = Math.max(1, Math.min(1000, Math.floor(o.count)))
  const out: bigint[] = []
  for (let i = 0; i < n; i++) {
    switch (o.mode) {
      case 'random': out.push(randomU64()); break
      case 'ms': out.push(BigInt(Math.floor(o.nowMs)) + BigInt(i)); break
      case 'seconds': out.push(BigInt(Math.floor(o.nowMs / 1000)) + BigInt(i)); break
      case 'expiry-shift': out.push((BigInt(Math.floor(o.nowMs / 1000) + (o.ttl ?? 60)) << 32n) | randomU32()); break
      case 'sequential': out.push(((o.start ?? 0n) + BigInt(i)) & UINT64_MAX); break
    }
  }
  return out
}

/** Decimal, 0x-hex or 0b-binary uint64. */
export function parseQueryId(input: string): bigint {
  const s = input.trim().replace(/[\s_,]/g, '')
  if (!s) throw new Error('Enter a query_id')
  let v: bigint
  try {
    if (!/^(0x[0-9a-f]+|0b[01]+|\d+)$/i.test(s)) throw new Error('bad')
    v = BigInt(s)
  }
  catch {
    throw new Error('Use a decimal number, 0x… hex or 0b… binary')
  }
  if (v > UINT64_MAX) throw new Error('Larger than uint64 (max 18446744073709551615)')
  return v
}

export interface Interpretation {
  label: string
  /** Unix seconds the value encodes. */
  unix?: number
  detail: string
}

// Plausible timestamps: 2015-01-01 .. now + 50 years
const MIN_TS = 1420070400
const plausible = (sec: number, nowSec: number) => sec >= MIN_TS && sec <= nowSec + 50 * 31_536_000

export function decodeQueryId(v: bigint, nowSec: number): { decimal: string, hex: string, high32: bigint, low32: bigint, interpretations: Interpretation[] } {
  const high32 = v >> 32n
  const low32 = v & 0xffffffffn
  const out: Interpretation[] = []
  const asTime = (div: bigint, label: string) => {
    const sec = Number(v / div)
    if (plausible(sec, nowSec)) out.push({ label, unix: Number(v) / Number(div), detail: `${label.toLowerCase()} since 1970` })
  }
  asTime(1n, 'Unix seconds')
  asTime(1000n, 'Milliseconds')
  asTime(1_000_000n, 'Microseconds')
  asTime(1_000_000_000n, 'Nanoseconds')
  if (plausible(Number(high32), nowSec)) {
    out.push({ label: '(time << 32) | n', unix: Number(high32), detail: `High 32 bits are a unix time (highload wallet v2 uses it as the expiry); low 32 bits = ${low32}` })
  }
  if (v < 2n ** 23n) {
    const shift = Number(v >> 10n)
    const bit = Number(v & 1023n)
    out.push({ label: 'Highload wallet v3', detail: bit === 1023 ? `shift ${shift}, bit_number 1023: invalid, the contract rejects it` : `shift ${shift}, bit_number ${bit}` })
  }
  if (!out.length) out.push({ label: 'No pattern', detail: v < 1_000_000n ? 'A small counter value.' : 'Looks random: no timestamp inside.' })
  return { decimal: v.toString(), hex: `0x${v.toString(16).padStart(16, '0')}`, high32, low32, interpretations: out }
}
