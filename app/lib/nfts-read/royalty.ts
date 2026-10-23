// TEP-66 royalty_params() through toncenter v3 runGetMethod. Imports @ton/core (client + vitest only).
import { Cell } from '@ton/core'
import { rateLimitedJson } from '~/utils/api-client'

/** toncenter POST /api/v3/runGetMethod stack entry. */
export interface StackEntry {
  type: string
  value: string
}

export interface Royalty {
  numerator: number
  denominator: number
  /** Share in percent, e.g. 2.2. */
  percent: number
  /** Raw address that receives royalties, null when the slice holds addr_none. */
  destination: string | null
}

/** TEP-66 `royalty_params()` → (numerator, denominator, destination). */
export function parseRoyalty(stack: StackEntry[]): Royalty {
  const [num, den, dest] = stack
  if (!num || !den || !dest || num.type !== 'num' || den.type !== 'num') throw new Error('Unexpected royalty_params result')
  const numerator = Number(BigInt(num.value))
  const denominator = Number(BigInt(den.value))
  const addr = Cell.fromBase64(dest.value).beginParse().loadMaybeAddress()
  return {
    numerator,
    denominator,
    // Rounded so 1/3 shows as 33.3333, not 33.333333333333336.
    percent: denominator > 0 ? Math.round((numerator * 1e6) / denominator) / 1e4 : 0,
    destination: addr ? addr.toRawString() : null
  }
}

/** Royalty taken from a sale at this price, in the sale currency's smallest units (floor). */
export function royaltyOn(units: bigint, r: Royalty): bigint {
  return r.denominator > 0 ? (units * BigInt(r.numerator)) / BigInt(r.denominator) : 0n
}

/** Calls royalty_params on a collection; null when the contract does not implement it. */
export async function fetchRoyalty(toncenterBase: string, collection: string): Promise<Royalty | null> {
  const res = await rateLimitedJson<{ exit_code: number, stack: StackEntry[] }>(`${toncenterBase}/v3/runGetMethod`, { provider: 'toncenter' }, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: collection, method: 'royalty_params', stack: [] })
  })
  return res.exit_code === 0 ? parseRoyalty(res.stack) : null
}
