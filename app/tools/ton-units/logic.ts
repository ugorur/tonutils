import { formatUnits, groupThousands, parseUnits } from '~/utils/units'

export const TON_DECIMALS = 9
export const NANO_PER_TON = 10n ** BigInt(TON_DECIMALS)

export interface UnitsResult {
  nano: bigint
  /** Plain decimal TON, e.g. "1234.5". */
  ton: string
  /** Grouped for reading, e.g. "1,234.5". */
  tonFormatted: string
  nanoFormatted: string
}

function result(nano: bigint): UnitsResult {
  const ton = formatUnits(nano, TON_DECIMALS)
  return { nano, ton, tonFormatted: groupThousands(ton), nanoFormatted: groupThousands(nano.toString()) }
}

/** "1.5" TON -> 1500000000n nanoTON. Throws on more than 9 decimals or bad input. */
export function tonToNano(ton: string): UnitsResult {
  return result(parseUnits(ton, TON_DECIMALS))
}

/** "1500000000" nanoTON -> "1.5" TON. Integers only. */
export function nanoToTon(nano: string): UnitsResult {
  const s = nano.trim().replace(/[\s_,]/g, '')
  if (!/^-?\d+$/.test(s)) throw new Error('nanoTON is a whole number, like 1500000000')
  return result(BigInt(s))
}
