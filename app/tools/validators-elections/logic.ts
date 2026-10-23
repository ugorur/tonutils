import type { StackValue } from '~/lib/network/stack'

export interface Participant {
  pubkey: string
  stake: bigint
  /** 16.16 fixed point; 196608 = 3×. */
  maxFactor: number
  /** Raw masterchain address the stake came from. */
  wallet: string
  adnl: string
}

export interface Election {
  /** Election id = unix time the new round starts. */
  electAt: number
  electClose: number
  minStake: bigint
  totalStake: bigint
  participants: Participant[]
  failed: boolean
  finished: boolean
}

const h64 = (v: StackValue) => (v as bigint).toString(16).padStart(64, '0')

/** Elector get-method `participant_list_extended`. Returns null when no election is open (elect_at = 0). */
export function parseParticipantList(stack: StackValue[]): Election | null {
  const [electAt, electClose, minStake, totalStake, list, failed, finished] = stack as [bigint, bigint, bigint, bigint, StackValue[], bigint, bigint]
  if (!electAt) return null
  return {
    electAt: Number(electAt),
    electClose: Number(electClose),
    minStake,
    totalStake,
    failed: failed !== 0n,
    finished: finished !== 0n,
    participants: (list ?? []).map((row) => {
      const [pubkey, info] = row as [bigint, StackValue[]]
      const [stake, maxFactor, addr, adnl] = info as bigint[]
      return { pubkey: h64(pubkey), stake: stake!, maxFactor: Number(maxFactor), wallet: `-1:${h64(addr!)}`, adnl: h64(adnl!) }
    })
  }
}

export interface ElectLimits {
  minValidators: number
  maxValidators: number
  minStake: bigint
  maxStake: bigint
  minTotalStake: bigint
  maxStakeFactor: number
}

export interface ElectResult {
  /** Number of validators that would be elected (0: the election would fail). */
  count: number
  /** Smallest stake that gets in. */
  minStake: bigint
  /** Sum of the stakes after the max-factor cap (what actually gets frozen). */
  effectiveTotal: bigint
  /** Indexes into the input that would be elected. */
  elected: Set<number>
}

/**
 * Same selection as `try_elect` in elector-code.fc: sort by stake, then pick the validator count m
 * (min..max validators) that maximises the total stake when each stake is capped at
 * max_factor × the m-th stake. Ties keep the elector's order only approximately (it also sorts by
 * submission time, which the get-method does not return); the count and minimum are unaffected.
 */
export function simulateElection(ps: { stake: bigint, maxFactor: number }[], l: ElectLimits): ElectResult {
  const sorted = ps
    .map((p, i) => ({ i, stake: p.stake < l.maxStake ? p.stake : l.maxStake, mf: BigInt(Math.min(p.maxFactor, l.maxStakeFactor)) }))
    .sort((a, b) => (b.stake > a.stake ? 1 : b.stake < a.stake ? -1 : 0))
  const none: ElectResult = { count: 0, minStake: 0n, effectiveTotal: 0n, elected: new Set() }
  const n = Math.min(sorted.length, l.maxValidators)
  if (n < Math.max(l.minValidators, 1)) return none
  const total = (m: number, mStake: bigint) => {
    let t = 0n
    for (let k = 0; k < m; k++) {
      const cap = (sorted[k]!.mf * mStake) >> 16n
      t += sorted[k]!.stake < cap ? sorted[k]!.stake : cap
    }
    return t
  }
  let best = 0n
  let m = 0
  for (let i = Math.max(l.minValidators, 1); i <= n; i++) {
    const s = sorted[i - 1]!.stake
    if (s < l.minStake) continue
    const t = total(i, s)
    if (t > best) {
      best = t
      m = i
    }
  }
  if (!m || best < l.minTotalStake) return none
  return { count: m, minStake: sorted[m - 1]!.stake, effectiveTotal: best, elected: new Set(sorted.slice(0, m).map(x => x.i)) }
}

export type Phase = 'open' | 'closed' | 'waiting'

/**
 * Where we are in the cycle. Elections for the round starting at `nextRound` open
 * `startBefore` seconds earlier and close `endBefore` seconds earlier (config param 15).
 */
export function electionPhase(roundStart: number, t: { electedFor: number, startBefore: number, endBefore: number }, now: number) {
  let nextRound = roundStart + t.electedFor
  while (nextRound <= now) nextRound += t.electedFor
  const opensAt = nextRound - t.startBefore
  const closesAt = nextRound - t.endBefore
  const phase: Phase = now < opensAt ? 'waiting' : now < closesAt ? 'open' : 'closed'
  return { phase, opensAt, closesAt, nextRound }
}

/** 1792741874 - now → "2 h 16 min" style countdown, or "now". */
export function countdown(seconds: number): string {
  if (seconds <= 0) return 'now'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d} d ${h} h`
  if (h) return `${h} h ${m} min`
  return `${m || 1} min`
}

export interface TonapiValidator { address: string, adnl_address: string, stake: number, max_factor: number }

/** tonapi returns stakes as JSON numbers; above 2^53 they lose precision, so treat them as approximate. */
export function share(stake: number, total: number): string {
  return total ? `${((stake / total) * 100).toFixed(2)}%` : '—'
}
