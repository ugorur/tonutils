import type { StackValue } from '~/lib/network/stack'

export interface Proposal {
  /** Proposal hash (key in the config contract's vote dictionary), hex. */
  hash: string
  expiresAt: number
  critical: boolean
  paramId: number
  /** Proposed value as base64 BOC; null means "delete this param". */
  value: string | null
  /** Hash the current value must have for the proposal to apply (null: no check). */
  ifHash: string | null
  /** Hash of the validator set the votes below were collected in. */
  vsetId: string
  /** Indexes (in that validator set) of validators that voted this round. */
  voters: number[]
  weightRemaining: bigint
  roundsRemaining: number
  wins: number
  losses: number
}

const hex = (v: bigint) => v.toString(16).padStart(64, '0')

/**
 * Config contract get-method `list_proposals` (config-code.fc `unpack_proposal`):
 * [phash, [expires, critical?, [param_id, param_val, param_hash], vset_id, voters_list, weight_remaining, rounds_remaining, losses, wins]]
 */
export function parseProposals(stack: StackValue[]): Proposal[] {
  const list = (stack[0] ?? []) as StackValue[]
  return list.map((row) => {
    const [phash, body] = row as [bigint, StackValue[]]
    const [expires, critical, setup, vsetId, voters, weightRemaining, roundsRemaining, losses, wins] = body as [bigint, bigint, StackValue[], bigint, StackValue[] | null, bigint, bigint, bigint, bigint]
    const [paramId, value, paramHash] = setup as [bigint, string | null, bigint]
    return {
      hash: hex(phash),
      expiresAt: Number(expires),
      critical: critical !== 0n,
      paramId: Number(paramId),
      value: typeof value === 'string' ? value : null,
      ifHash: paramHash === -1n ? null : hex(paramHash),
      vsetId: hex(vsetId),
      voters: ((voters ?? []) as bigint[]).map(Number),
      weightRemaining,
      roundsRemaining: Number(roundsRemaining),
      wins: Number(wins),
      losses: Number(losses)
    }
  })
}

export interface RoundProgress {
  /** False when a new validator round started after the last vote: votes reset on the next vote. */
  sameRound: boolean
  required: bigint
  collected: bigint
  /** 0–100, share of the required ¾ weight collected this round. */
  percent: number
  /** The proposal already won this round. */
  wonRound: boolean
}

/** Votes this round vs the ¾ of total validator weight the config contract requires (muldiv(total_weight, 3, 4)). */
export function roundProgress(p: Proposal, current: { vsetHash: string, totalWeight: bigint }): RoundProgress {
  const required = (current.totalWeight * 3n) / 4n
  const sameRound = p.vsetId === current.vsetHash
  if (!sameRound) return { sameRound, required, collected: 0n, percent: 0, wonRound: false }
  const collected = required - p.weightRemaining
  const wonRound = p.weightRemaining < 0n
  const percent = required ? Math.min(100, Number((collected * 10000n) / required) / 100) : 0
  return { sameRound, required, collected, percent, wonRound }
}

export interface VotingRules { minWins: number, maxLoses: number }

/** Plain-English status of a proposal. */
export function proposalStatus(p: Proposal, rules: VotingRules, now: number): string {
  if (p.expiresAt <= now) return 'Expired'
  const need = Math.max(0, rules.minWins - p.wins)
  return `Needs ${need} more winning ${need === 1 ? 'round' : 'rounds'} · ${p.roundsRemaining} ${p.roundsRemaining === 1 ? 'round' : 'rounds'} left · ${p.losses}/${rules.maxLoses} lost`
}
