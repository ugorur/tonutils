// Vesting wallet (ton-blockchain/vesting-contract): unlock schedule from the contract's own get_locked_amount formula.
import type { VestingParams } from '~/lib/wallet-detection/state'
import { vestingLockedAmount } from '~/lib/wallet-detection/state'

export type { VestingState } from '~/lib/wallet-detection/state'
export { parseVestingData, vestingLockedAmount } from '~/lib/wallet-detection/state'

export interface UnlockEvent {
  /** Unix seconds: the first second at which the new amount is unlocked. */
  time: number
  /** Amount that becomes free at this time. */
  amount: bigint
  lockedAfter: bigint
}

// ponytail: one event per unlock period; schedules with more periods than this are summarised, not listed.
export const MAX_EVENTS = 5000

/** Every moment the locked amount drops, or null when there are too many periods to list. */
export function unlockSchedule(v: VestingParams): UnlockEvent[] | null {
  if (v.unlockPeriod <= 0) return null
  const periods = Math.floor(v.totalDuration / v.unlockPeriod)
  if (periods > MAX_EVENTS) return null
  const end = v.startTime + v.totalDuration
  const times = new Set<number>([v.startTime + v.cliffDuration, end + 1])
  for (let k = 1; k <= periods; k++) times.add(v.startTime + k * v.unlockPeriod)
  const out: UnlockEvent[] = []
  let prev = v.totalAmount
  for (const t of [...times].sort((a, b) => a - b)) {
    if (t < v.startTime + v.cliffDuration) continue
    const locked = vestingLockedAmount(v, t)
    if (locked < prev) out.push({ time: t, amount: prev - locked, lockedAfter: locked })
    prev = locked
  }
  return out
}

export interface VestingNow {
  locked: bigint
  unlocked: bigint
  /** balance − locked, never below zero: what the owner can send anywhere right now. */
  withdrawable: bigint
  next: UnlockEvent | null
  phase: 'not-started' | 'cliff' | 'vesting' | 'done'
}

export function vestingNow(v: VestingParams, balance: bigint, now: number, events: UnlockEvent[] | null): VestingNow {
  const locked = vestingLockedAmount(v, now)
  const withdrawable = balance > locked ? balance - locked : 0n
  const phase = now < v.startTime ? 'not-started' : now < v.startTime + v.cliffDuration ? 'cliff' : locked > 0n ? 'vesting' : 'done'
  // Before the start with no cliff the contract's formula can exceed the total; never show a negative unlocked amount.
  return { locked, unlocked: locked < v.totalAmount ? v.totalAmount - locked : 0n, withdrawable, next: events?.find(e => e.time > now) ?? null, phase }
}

/** "1 year 2 months", from seconds (30-day months, 365-day years: display only). */
export function humanDuration(sec: number): string {
  const parts: string[] = []
  const units: [number, string][] = [[365 * 86400, 'year'], [30 * 86400, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]
  let rest = sec
  for (const [n, name] of units) {
    const q = Math.floor(rest / n)
    if (q) parts.push(`${q} ${name}${q === 1 ? '' : 's'}`)
    rest -= q * n
    if (parts.length === 2) break
  }
  return parts.join(' ') || `${sec} seconds`
}

export interface TcVestingInfo {
  address: string
  start_time: number
  total_duration: number
  unlock_period: number
  cliff_duration: number
  sender_address: string
  owner_address: string
  total_amount: string
  whitelist: string[]
}
