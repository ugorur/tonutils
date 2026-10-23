// Plain GRAM transfer with an optional text comment, as a TonConnect message.
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Note } from '~/lib/wallet-actions/core'
import { formatCoin } from '~/utils/currency'
import { commentBody } from '~/utils/ton/messages'

/** Kept back by "Max": a simple transfer costs well under this in network fees. */
export const FEE_RESERVE = 10_000_000n // 0.01 GRAM

/** One message: value to `destination` (bounce flag is part of the friendly address) + comment body if any. */
export function buildTonTransfer(p: { destination: string, amount: bigint, comment: string }): TonConnectMessage {
  return {
    address: p.destination,
    amount: p.amount,
    payload: p.comment.trim() ? commentBody(p.comment) : undefined
  }
}

/** Problems with the amount given the sender's balance (null balance = unknown, e.g. not connected). */
export function amountProblem(amount: bigint | null, balance: bigint | null): Note | null {
  if (amount === null) return null
  if (amount <= 0n) return { level: 'error', text: 'Enter an amount greater than zero.' }
  if (balance === null) return null
  if (amount > balance) return { level: 'error', text: `More than your balance (${formatCoin(balance)}).` }
  if (amount + FEE_RESERVE > balance) return { level: 'warning', text: `This leaves less than ${formatCoin(FEE_RESERVE)} for the network fee. Your wallet may refuse it; use Max instead.` }
  return null
}

/** Largest amount that still leaves FEE_RESERVE for fees. */
export function maxSendable(balance: bigint): bigint {
  return balance > FEE_RESERVE ? balance - FEE_RESERVE : 0n
}
