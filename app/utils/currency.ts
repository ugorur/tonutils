// The native coin of the TON network. Toncoin was renamed Gram (GRAM) on 2026-06-15;
// the chain is still TON and on-chain units are unchanged (1 GRAM = 10^9 nano).
// Never hardcode the symbol in UI copy: use these constants.
import { formatAmount } from './units'

export const COIN_SYMBOL = 'GRAM'
export const COIN_NAME = 'Gram'
export const COIN_FORMER = 'Toncoin'
export const COIN_DECIMALS = 9
export const NANO_NAME = 'nanoGRAM'
/** Same unit under its old name; mention it in hints so people who know "nanoTON" find their way. */
export const NANO_FORMER = 'nanoTON'
export const NANO_PER_COIN = 10n ** BigInt(COIN_DECIMALS)
/** One-line note for UI: "Toncoin is now Gram (GRAM). Same TON network." */
export const COIN_RENAME_NOTE = `${COIN_FORMER} is now ${COIN_NAME} (${COIN_SYMBOL}). Same TON network.`

export interface FormatCoinOptions {
  /** Append the symbol ("1.5 GRAM"). Default true. */
  symbol?: boolean
  /** Thousands separators. Default true. */
  group?: boolean
  /** Cut to at most this many decimals (truncates, never rounds up). Default: all 9. */
  maxDecimals?: number
}

/** 1500000000n -> "1.5 GRAM". Exact bigint math; truncates when maxDecimals is set. */
export function formatCoin(nano: bigint, opts: FormatCoinOptions = {}): string {
  const s = formatAmount(nano, COIN_DECIMALS, opts)
  return (opts.symbol ?? true) ? `${s} ${COIN_SYMBOL}` : s
}
