// Staking rewards projection. Pure math, no Vue / @ton.
import type { PoolKind } from '~/lib/staking/pools'
import { ROUND_SECONDS } from '~/lib/staking/pools'
import { COIN_SYMBOL } from '~/utils/currency'

export const YEAR_SECONDS = 365 * 86400

/** One-off costs per pool type in GRAM (verified from contract sources / live get_params, see the test). */
export const KIND_FEES: Record<PoolKind | 'custom', { entry: number, exit: number, note: string }> = {
  liquidTF: { entry: 0, exit: 0, note: `Only network fees (a few hundredths of a ${COIN_SYMBOL}). The 1 ${COIN_SYMBOL} attached to a deposit and 1.05 ${COIN_SYMBOL} to an unstake mostly come back.` },
  whales: { entry: 0.2, exit: 0.2, note: `TON Whales charges a 0.1 ${COIN_SYMBOL} deposit fee + 0.1 receipt on the way in, and 0.1 + 0.1 on the way out.` },
  tf: { entry: 1, exit: 0, note: `The nominator-pool contract keeps 1 ${COIN_SYMBOL} from every deposit as a processing fee.` },
  custom: { entry: 0, exit: 0, note: 'No fees assumed. Enter your own APY.' }
}

export interface ProjectionInput {
  /** GRAM staked. */
  principal: number
  /** Annual yield in percent, including compounding every payout. */
  apy: number
  /** Seconds between payouts (pool cycle_length; one validation round = 65536 s). */
  cycleSeconds: number
  days: number
  /** Reinvest rewards (what liquid staking and the nominator pools do on their own). */
  compound: boolean
  entryFee: number
  exitFee: number
}

export interface Milestone {
  label: string
  days: number
  cycles: number
  rewards: number
  balance: number
}

export interface Projection {
  /** Reward rate per payout (fraction). */
  ratePerCycle: number
  cyclesPerYear: number
  perCycle: number
  perDay: number
  perMonth: number
  perYear: number
  /** Effective annual yield of this mode (lower than APY without compounding). */
  effectiveApy: number
  end: Milestone
  /** Rewards minus entry and exit fees over the chosen period. */
  netProfit: number
  /** Days until rewards cover the fees (0 when there are none, null when never). */
  breakEvenDays: number | null
  milestones: Milestone[]
}

function at(input: ProjectionInput, r: number, days: number, label: string): Milestone {
  // Rewards are paid at whole cycles only.
  const cycles = Math.floor((days * 86400) / input.cycleSeconds)
  const balance = input.compound ? input.principal * (1 + r) ** cycles : input.principal * (1 + r * cycles)
  return { label, days, cycles, rewards: balance - input.principal, balance }
}

export function project(input: ProjectionInput): Projection {
  const cycleSeconds = input.cycleSeconds > 0 ? input.cycleSeconds : ROUND_SECONDS
  const i = { ...input, cycleSeconds }
  const n = YEAR_SECONDS / cycleSeconds
  const r = (1 + input.apy / 100) ** (1 / n) - 1
  const perCycle = input.principal * r
  const effectiveApy = input.compound ? input.apy : r * n * 100
  const perYear = input.principal * effectiveApy / 100
  const end = at(i, r, input.days, 'Your period')
  const fees = input.entryFee + input.exitFee
  const perDay = perCycle * 86400 / cycleSeconds
  const marks: [string, number][] = [['1 month', 30], ['3 months', 91], ['6 months', 182], ['1 year', 365], ['3 years', 1095]]
  return {
    ratePerCycle: r,
    cyclesPerYear: n,
    perCycle,
    perDay,
    perMonth: perDay * 365 / 12,
    perYear,
    effectiveApy,
    end,
    netProfit: end.rewards - fees,
    breakEvenDays: fees <= 0 ? 0 : perDay > 0 ? Math.ceil(fees / perDay) : null,
    milestones: marks.map(([label, d]) => at(i, r, d, label))
  }
}
