// Storage rent projection: yearly cost, when the balance runs out, when the account can be frozen / deleted,
// and how much to keep for N years. Node rules (transaction.cpp prepare_storage_phase): at each transaction the
// account pays storage since last_paid plus any old debt; if it cannot, the debt above freeze_due_limit freezes an
// active account and the debt above delete_due_limit deletes an uninit/frozen one.
import type { StoragePrice } from '~/lib/fees-time/fees'
import { currentStoragePrice, SECONDS_PER_YEAR, storageFee, storageFeeFor } from '~/lib/fees-time/fees'

export type AccountStatus = 'active' | 'uninit' | 'frozen' | 'nonexist'

export interface RentInput {
  cells: bigint
  bits: bigint
  balance: bigint
  /** Unpaid storage debt already recorded on the account. */
  due: bigint
  /** Unix time storage was last paid (0 = unknown: count from now). */
  lastPaid: number
  status: AccountStatus
  masterchain: boolean
  freezeDueLimit: bigint
  deleteDueLimit: bigint
  prices: StoragePrice[]
  now: number
  years: number
}

export interface RentResult {
  perYear: bigint
  perDay: bigint
  /** Storage owed right now (charged at the next transaction), including old debt. */
  owedNow: bigint
  /** Unix time the balance no longer covers the rent, or null if never / already. */
  emptyAt: number | null
  /** Earliest unix time a transaction would freeze the account (active only). */
  freezeAt: number | null
  /** Earliest unix time a transaction would delete the account (uninit/frozen; for active: after it was frozen). */
  deleteAt: number | null
  /** Rent for `years` from now, plus what is owed now. */
  keepFor: bigint
  /** How much to add so the balance covers `keepFor` (0 if it already does). */
  topUp: bigint
  /** True when the account stores nothing chargeable (no rent ever). */
  free: boolean
}

/** First moment (unix seconds) when ceil(rate * (t - lastPaid) / 2^16) + due > limit. */
function crossing(limit: bigint, due: bigint, ratePs: bigint, from: number): number | null {
  if (ratePs <= 0n) return null
  const budget = limit - due
  if (budget < 0n) return from
  // ceil(r*s/65536) > budget  <=>  r*s > budget*65536
  const s = (budget * 65536n) / ratePs + 1n
  return from + Number(s)
}

export function estimateRent(i: RentInput): RentResult {
  const price = currentStoragePrice(i.prices, i.now)
  const rate = price ? i.cells * (i.masterchain ? price.mcCellPricePs : price.cellPricePs) + i.bits * (i.masterchain ? price.mcBitPricePs : price.bitPricePs) : 0n
  const perYear = price ? storageFeeFor(i.cells, i.bits, SECONDS_PER_YEAR, price, i.masterchain) : 0n
  const perDay = price ? storageFeeFor(i.cells, i.bits, 86_400, price, i.masterchain) : 0n
  const from = i.lastPaid > 0 && i.lastPaid <= i.now ? i.lastPaid : i.now
  const owedNow = storageFee({ cells: i.cells, bits: i.bits, lastPaid: from, now: i.now, prices: i.prices, masterchain: i.masterchain }) + i.due
  const keepFor = owedNow + (price ? storageFeeFor(i.cells, i.bits, i.years * SECONDS_PER_YEAR, price, i.masterchain) : 0n)

  const at = (limit: bigint) => crossing(limit, i.due, rate, from)
  const emptyAt = at(i.balance)
  let freezeAt: number | null = null
  let deleteAt: number | null = null
  if (i.status === 'active') {
    freezeAt = at(i.balance + i.freezeDueLimit)
    // Once frozen the debt keeps growing; deletion needs debt > delete_due_limit (frozen state is smaller, so this is the earliest date).
    deleteAt = at(i.balance + i.deleteDueLimit)
  }
  else if (i.status === 'uninit' || i.status === 'frozen') {
    deleteAt = at(i.balance + i.deleteDueLimit)
  }
  return {
    perYear,
    perDay,
    owedNow,
    emptyAt,
    freezeAt,
    deleteAt,
    keepFor,
    topUp: keepFor > i.balance ? keepFor - i.balance : 0n,
    free: rate === 0n
  }
}

/** "in 3 years 2 months" style distance from `now` (coarse, for reading). */
export function describeFrom(now: number, at: number): string {
  const s = at - now
  if (s <= 0) return 'already reached'
  const y = s / SECONDS_PER_YEAR
  if (y >= 1000) return `in more than ${Math.floor(y).toLocaleString('en-US')} years`
  if (y >= 2) return `in about ${Math.floor(y)} years`
  const d = Math.floor(s / 86_400)
  if (d >= 60) return `in about ${Math.floor(d / 30)} months`
  if (d >= 2) return `in ${d} days`
  const h = Math.floor(s / 3600)
  return h >= 1 ? `in ${h} h` : `in ${Math.max(1, Math.floor(s / 60))} min`
}

/** ISO date for a unix time, or null when it is too far away for a calendar date to mean anything. */
export function dateOf(at: number): string | null {
  return at < 253402300800 ? new Date(at * 1000).toISOString().slice(0, 10) : null
}

/** tonapi /v2/blockchain/accounts/{id} subset. */
export interface TonapiRawAccount {
  address: string
  balance: number | string
  status: AccountStatus
  storage?: { used_cells: number, used_bits: number, used_public_cells?: number, last_paid: number, due_payment?: number | string }
}

export function accountToInput(a: TonapiRawAccount) {
  return {
    cells: BigInt(a.storage?.used_cells ?? 0),
    bits: BigInt(a.storage?.used_bits ?? 0),
    balance: BigInt(a.balance),
    due: BigInt(a.storage?.due_payment ?? 0),
    lastPaid: a.storage?.last_paid ?? 0,
    status: a.status,
    masterchain: a.address.startsWith('-1:')
  }
}
