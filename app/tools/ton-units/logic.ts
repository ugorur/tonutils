import { COIN_DECIMALS as TON_DECIMALS } from '~/utils/currency'
import { formatUnits, groupThousands, parseUnits } from '~/utils/units'

// GRAM (formerly Toncoin) <-> nano. Function names keep "ton": the chain and the unit math are unchanged.

export interface UnitsResult {
  nano: bigint
  /** Plain decimal GRAM, e.g. "1234.5". */
  ton: string
  /** Grouped for reading, e.g. "1,234.5". */
  tonFormatted: string
  nanoFormatted: string
}

function result(nano: bigint): UnitsResult {
  const ton = formatUnits(nano, TON_DECIMALS)
  return { nano, ton, tonFormatted: groupThousands(ton), nanoFormatted: groupThousands(nano.toString()) }
}

/** "1.5" GRAM -> 1500000000n nanoGRAM. Throws on more than 9 decimals or bad input. */
export function tonToNano(ton: string): UnitsResult {
  return result(parseUnits(ton, TON_DECIMALS))
}

/** "1500000000" nanoGRAM -> "1.5" GRAM. Integers only. */
export function nanoToTon(nano: string): UnitsResult {
  const s = nano.trim().replace(/[\s_,]/g, '')
  if (!/^-?\d+$/.test(s)) throw new Error('nanoGRAM is a whole number, like 1500000000')
  return result(BigInt(s))
}
