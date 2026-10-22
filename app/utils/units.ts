// Exact decimal <-> integer conversion for TON (9 decimals) and jettons (any decimals).
// No floating point anywhere: amounts are strings in, bigint out.

const DECIMAL_RE = /^(-)?(\d*)(?:\.(\d*))?$/

/** Parses a human amount ("1.5", "1,000.25", "-0.1") into base units. Throws Error with a readable message. */
export function parseUnits(input: string, decimals = 9): bigint {
  const s = input.trim().replace(/[\s_,]/g, '')
  const m = DECIMAL_RE.exec(s)
  if (!s || !m || (!m[2] && !m[3])) throw new Error('Enter a number like 1.5')
  const [, sign, whole = '', frac = ''] = m
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  const value = BigInt((whole || '0') + frac.padEnd(decimals, '0'))
  return sign ? -value : value
}

/** Formats base units as a plain decimal string without trailing zeros ("1.5", "0", "-0.000000001"). */
export function formatUnits(value: bigint, decimals = 9): string {
  const neg = value < 0n
  const abs = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = (abs / base).toString()
  const frac = decimals ? (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '') : ''
  return (neg ? '-' : '') + whole + (frac ? `.${frac}` : '')
}

/** Adds thousands separators to the integer part of a plain decimal string: "1234567.5" -> "1,234,567.5". */
export function groupThousands(decimal: string): string {
  const [whole = '', frac] = decimal.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac ? `${grouped}.${frac}` : grouped
}
