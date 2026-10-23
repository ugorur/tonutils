// Swap tool helpers. Routing and message building come from swap.coffee (~/lib/prices-defi/swapcoffee);
// this file holds the checks around them.
import type { Asset } from '~/lib/prices-defi/assets'
import { isNativeAddress, normalizeMaster } from '~/lib/prices-defi/assets'
import { COIN_SYMBOL } from '~/utils/currency'

/** Price impact at or above this needs an explicit confirmation. */
export const HIGH_IMPACT = 0.05

/** ?from=native|EQ…  -> 'native', a normalized master, or null when invalid/missing. */
export function assetParam(v: unknown): 'native' | string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  if (v === 'native' || v.toUpperCase() === 'TON' || v.toUpperCase() === 'GRAM') return 'native'
  try {
    return isNativeAddress(v) ? 'native' : normalizeMaster(v)
  }
  catch {
    return null
  }
}

export interface Balances {
  /** nanoGRAM. */
  gram: bigint
  /** Base units of the input jetton (jetton input only). */
  jetton?: bigint
}

/** Why the wallet can't pay for this swap, or null. `gas` is the GRAM attached on top (nano). */
export function balanceProblem(from: Asset, units: bigint, gas: bigint, b: Balances): string | null {
  if (from.kind === 'native') {
    return b.gram < units + gas ? `Not enough ${from.symbol}: you need the amount plus about ${Number(gas) / 1e9} ${from.symbol} for gas.` : null
  }
  if ((b.jetton ?? 0n) < units) return `Not enough ${from.symbol} in this wallet.`
  if (b.gram < gas) return `Not enough ${COIN_SYMBOL} for gas: the swap attaches about ${Number(gas) / 1e9} ${COIN_SYMBOL} (most comes back).`
  return null
}
