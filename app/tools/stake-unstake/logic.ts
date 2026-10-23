// Message bodies and send plans for staking through TonConnect. Imports @ton/core: Tool.vue / tests only.
import type { Address, Cell } from '@ton/core'
import { beginCell } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { PoolKind, StakingPool, WhalesParams } from '~/lib/staking/pools'
import { COIN_SYMBOL, formatCoin } from '~/utils/currency'
import { commentBody, jettonBurnBody } from '~/utils/ton/messages'
import { OP } from '~/utils/ton/opcodes'

const GRAM = 1_000_000_000n

// Tonstakers (tonstakers-sdk constants): 1 GRAM attached to a deposit for processing, 1.05 GRAM to an unstake (burn).
export const TONSTAKERS_STAKE_RESERVE = GRAM
export const TONSTAKERS_UNSTAKE_VALUE = 1_050_000_000n
// TON Core nominator-pool (func/pool.fc): DEPOSIT_PROCESSING_FEE = 1 TON is kept from every "d" deposit; "w" needs a coin attached.
export const TF_DEPOSIT_FEE = GRAM
export const TF_WITHDRAW_VALUE = GRAM
// TON Whales: gas_limit field that Tonkeeper sends (100000), seen in real deposit/withdraw bodies.
export const WHALES_GAS_LIMIT = 100_000n

/** TON Whales stake_deposit#7bcd1fef query_id:uint64 gas_limit:Coins. query_id must be > 0. */
export function whalesDepositBody(queryId: bigint, gasLimit = WHALES_GAS_LIMIT): Cell {
  return beginCell().storeUint(OP('whales_deposit'), 32).storeUint(queryId, 64).storeCoins(gasLimit).endCell()
}

/** TON Whales stake_withdraw#da803efd query_id:uint64 gas_limit:Coins stake:Coins. stake = 0 withdraws everything. */
export function whalesWithdrawBody(queryId: bigint, amount: bigint, gasLimit = WHALES_GAS_LIMIT): Cell {
  return beginCell().storeUint(OP('whales_withdraw'), 32).storeUint(queryId, 64).storeCoins(gasLimit).storeCoins(amount).endCell()
}

/** Tonstakers deposit#47d54391 query_id:uint64 (no partner code). query_id 1 as the official SDK sends it. */
export function tonstakersDepositBody(queryId = 1n): Cell {
  return beginCell().storeUint(OP('tonstakers_deposit'), 32).storeUint(queryId, 64).endCell()
}

/**
 * How a tsTON unstake is paid. The burn's custom payload holds two bits: wait_till_round_end, fill_or_kill.
 * auto (0,0): instant if the pool has liquidity, otherwise a withdrawal bill paid after the round.
 * round (1,0): always wait for the round end (best rate, includes this round's rewards).
 * instant (0,1): instant or fail (tsTON comes back).
 */
export type UnstakeMode = 'auto' | 'round' | 'instant'

export function tonstakersUnstakeBody(p: { amount: bigint, owner: Address, mode: UnstakeMode, queryId?: bigint }): Cell {
  const flags = beginCell().storeBit(p.mode === 'round').storeBit(p.mode === 'instant').endCell()
  return jettonBurnBody({ queryId: p.queryId ?? 0n, amount: p.amount, responseDestination: p.owner, customPayload: flags })
}

/** Whales needs a non-zero query id; any unique value works. */
export const freshQueryId = () => BigInt(Date.now())

export type Action = 'stake' | 'unstake'

export interface PlanInput {
  kind: PoolKind
  action: Action
  pool: StakingPool
  /** GRAM to stake, or tsTON / GRAM to unstake (nano). null = not entered. */
  amount: bigint | null
  /** Whales: withdraw the whole position (amount 0). */
  withdrawAll?: boolean
  mode?: UnstakeMode
  whales?: WhalesParams | null
  /** Connected wallet (needed for tsTON unstake). */
  owner?: Address | null
  /** Connected wallet's tsTON jetton wallet (raw) and balance. */
  jettonWallet?: string | null
  jettonBalance?: bigint | null
  /** Current nominator position in this pool (whales/tf), nano. */
  staked?: bigint
  /** The connected wallet's positions were loaded and it has none in this pool (whales/tf withdraw would be wasted). */
  noPosition?: boolean
  queryId?: bigint
}

export interface Plan {
  messages: TonConnectMessage[]
  /** Why nothing can be sent yet. */
  problem?: string
  /** What the user should know about this exact transaction. */
  notes: string[]
}

const empty = (problem?: string, notes: string[] = []): Plan => ({ messages: [], problem, notes })

export function buildPlan(i: PlanInput): Plan {
  const pool = i.pool.address
  const amt = i.amount
  if (i.kind === 'liquidTF') {
    if (i.action === 'stake') {
      if (amt === null || amt <= 0n) return empty('Enter how much to stake.')
      if (amt < BigInt(i.pool.min_stake)) return empty(`The minimum is ${formatCoin(BigInt(i.pool.min_stake))}.`)
      return {
        messages: [{ address: pool, amount: amt + TONSTAKERS_STAKE_RESERVE, payload: tonstakersDepositBody() }],
        notes: [`${formatCoin(TONSTAKERS_STAKE_RESERVE)} is attached on top of your stake to pay for minting tsTON. What is not used comes back to you.`]
      }
    }
    if (!i.owner) return empty('Connect your wallet to see your tsTON balance.')
    if (i.jettonBalance === 0n) return empty('This wallet holds no tsTON to unstake.')
    if (!i.jettonWallet) return empty('Loading your tsTON wallet…')
    if (amt === null || amt <= 0n) return empty('Enter how much tsTON to unstake.')
    if (i.jettonBalance !== null && i.jettonBalance !== undefined && amt > i.jettonBalance) return empty('That is more tsTON than you hold.')
    const mode = i.mode ?? 'auto'
    return {
      messages: [{ address: i.jettonWallet, amount: TONSTAKERS_UNSTAKE_VALUE, payload: tonstakersUnstakeBody({ amount: amt, owner: i.owner, mode }) }],
      notes: [
        `The tsTON is burned from your jetton wallet and the pool pays out ${COIN_SYMBOL}. ${formatCoin(TONSTAKERS_UNSTAKE_VALUE)} is attached for fees; the unused part comes back.`,
        mode === 'round'
          ? 'You receive a withdrawal bill (an NFT). The pool pays it automatically after the round ends.'
          : mode === 'instant'
            ? 'Paid right away if the pool has enough liquidity. If not, the burn fails and your tsTON comes back.'
            : 'Paid right away if the pool has enough liquidity; otherwise you get a withdrawal bill (NFT) paid after the round ends.'
      ]
    }
  }

  if (i.kind === 'whales') {
    const w = i.whales
    if (!w) return empty('Loading the pool fees…')
    const queryId = i.queryId ?? freshQueryId()
    if (i.action === 'stake') {
      if (!w.enabled) return empty('This pool is not accepting deposits right now.')
      if (amt === null || amt <= 0n) return empty('Enter how much to stake.')
      if (amt < w.minStake) return empty(`The minimum stake is ${formatCoin(w.minStake)}.`)
      const fee = w.depositFee + w.receiptPrice
      return {
        messages: [{ address: pool, amount: amt + fee, payload: whalesDepositBody(queryId) }],
        notes: [`The pool keeps ${formatCoin(fee)} as deposit and receipt fee. Your stake starts earning from the next round it joins.`]
      }
    }
    if (i.noPosition) return empty('The connected wallet has no stake in this pool.')
    const fee = w.withdrawFee + w.receiptPrice
    if (!i.withdrawAll && (amt === null || amt <= 0n)) return empty('Enter how much to withdraw, or tick "Withdraw everything".')
    if (!i.withdrawAll && i.staked !== undefined && amt! > i.staked) return empty('That is more than your position in this pool.')
    return {
      messages: [{ address: pool, amount: fee, payload: whalesWithdrawBody(queryId, i.withdrawAll ? 0n : amt!) }],
      notes: [`Exactly ${formatCoin(fee)} must be attached (the pool rejects any other amount). Coins that are not locked in the current round come back right away; the rest after the round ends.`]
    }
  }

  // TON Core nominator pool: plain text comments.
  if (i.action === 'stake') {
    if (amt === null || amt <= 0n) return empty('Enter how much to stake.')
    const firstDeposit = !i.staked
    if (firstDeposit && i.pool.max_nominators >= 0 && i.pool.current_nominators >= i.pool.max_nominators) return empty('This pool\'s nominator list is full: it would reject a new nominator.')
    const minStake = BigInt(i.pool.min_stake) - TF_DEPOSIT_FEE
    if (firstDeposit && amt < minStake) return empty(`The minimum stake is ${formatCoin(minStake)}.`)
    return {
      messages: [{ address: pool, amount: amt + TF_DEPOSIT_FEE, payload: commentBody('d') }],
      notes: [`${formatCoin(TF_DEPOSIT_FEE)} is kept by the pool as deposit processing fee. The deposit takes effect in the next round.`]
    }
  }
  if (i.noPosition) return empty('The connected wallet has no stake in this pool.')
  return {
    messages: [{ address: pool, amount: TF_WITHDRAW_VALUE, payload: commentBody('w') }],
    notes: ['This requests a withdrawal of your whole stake (nominator pools do not support partial withdrawals). It is paid when the pool gets its stake back from the elector, after the round ends. Unused coins come back.']
  }
}
