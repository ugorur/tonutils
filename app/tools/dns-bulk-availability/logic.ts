import { Address } from '@ton/core'
import type { DnsStatus } from '~/lib/dns-read/core'
import { cleanName, minPrice, nameError, utcDate } from '~/lib/dns-read/core'
import { formatAmount } from '~/utils/units'

export const MAX_NAMES = 500

export interface NameEntry {
  input: string
  name: string
  /** Validation error, or 'Duplicate'. */
  error: string
}

/** One name per line (commas, semicolons and spaces also separate). Keeps order, flags duplicates. */
export function parseNames(text: string): NameEntry[] {
  const seen = new Set<string>()
  const out: NameEntry[] = []
  for (const input of text.split(/[\s,;]+/)) {
    if (!input) continue
    const name = cleanName(input)
    const error = nameError(name) || (seen.has(name) ? 'Duplicate' : '')
    seen.add(name)
    out.push({ input, name, error })
  }
  return out
}

export interface BulkRow {
  name: string
  /** Lowercase raw item address (valid names only). */
  item?: string
  status?: DnsStatus
  error?: string
}

export const STATUS_LABEL: Record<DnsStatus['kind'], string> = {
  available: 'Available',
  auction: 'In auction',
  owned: 'Taken',
  expired: 'Expired (can be released)'
}

export interface Summary { available: number, auction: number, owned: number, expired: number, invalid: number }

export function summarize(rows: BulkRow[]): Summary {
  const s: Summary = { available: 0, auction: 0, owned: 0, expired: 0, invalid: 0 }
  for (const r of rows) {
    if (r.status) s[r.status.kind]++
    else s.invalid++
  }
  return s
}

const friendly = (raw: string, testnet: boolean) => Address.parse(raw).toString({ bounceable: false, testOnly: testnet })
const coins = (n: bigint) => formatAmount(n, 9, { group: false })

/** CSV: one row per name. Amounts in whole coins (exact decimals), times in UTC. */
export function csvRows(rows: BulkRow[], testnet = false) {
  return rows.map((r) => {
    const s = r.status
    return {
      domain: `${r.name}.ton`,
      status: s ? STATUS_LABEL[s.kind] : r.error ?? 'Invalid',
      price: s?.kind === 'available' || s?.kind === 'expired' ? coins(s.minPrice) : s?.kind === 'auction' ? coins(s.bid) : '',
      price_note: s?.kind === 'available' || s?.kind === 'expired' ? 'minimum opening bid' : s?.kind === 'auction' ? 'current bid' : '',
      owner_or_leader: s?.kind === 'auction' ? friendly(s.bidder, testnet) : s?.kind === 'owned' || s?.kind === 'expired' ? friendly(s.owner, testnet) : '',
      auction_ends_utc: s?.kind === 'auction' ? utcDate(s.endTime) : '',
      expires_utc: s?.kind === 'owned' || s?.kind === 'expired' ? utcDate(s.expiresAt) : '',
      item_address: r.item ?? ''
    }
  })
}

/** Opening price by name length, as the collection charges it now. */
export function priceTable(now = Math.floor(Date.now() / 1000)) {
  return [4, 5, 6, 7, 8, 9, 10, 11].map(n => ({ length: n === 11 ? '11+' : String(n), price: minPrice(n, now) }))
}
