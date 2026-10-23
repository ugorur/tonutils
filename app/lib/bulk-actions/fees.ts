// Rough fee reserve for a list of outgoing messages, used only to warn before signing (the wallet shows the real fee).
import type { Note } from '~/lib/wallet-actions/core'
import { formatCoin } from '~/utils/currency'

/** Per signed request: compute + import fee of the wallet's external message. */
export const FEE_PER_BATCH = 10_000_000n // 0.01 GRAM
/** Per outgoing message: forward fee + action fee, with headroom for a comment. */
export const FEE_PER_MESSAGE = 1_000_000n // 0.001 GRAM

export function feeReserve(messages: number, perRequest: number): bigint {
  if (messages <= 0) return 0n
  return BigInt(Math.ceil(messages / Math.max(1, perRequest))) * FEE_PER_BATCH + BigInt(messages) * FEE_PER_MESSAGE
}

/** Balance check: error when the attached GRAM alone exceeds the balance, warning when fees may not fit. */
export function balanceNote(balance: bigint | null, attached: bigint, reserve: bigint): Note | null {
  if (balance === null || attached === 0n) return null
  if (attached > balance) return { level: 'error', text: `This needs ${formatCoin(attached)} but the wallet holds ${formatCoin(balance)}.` }
  if (attached + reserve > balance) return { level: 'warning', text: `After sending ${formatCoin(attached)} only ${formatCoin(balance - attached)} is left for network fees (about ${formatCoin(reserve)} needed). The last messages may fail; top up first.` }
  return null
}
