// Impermanent loss for a 50/50 constant-product pool (x·y = k): STON.fi v1/v2 "constant product" pools
// and DeDust volatile pools. Stable-swap pools follow a flatter curve near the peg, so these numbers
// overstate their loss while prices stay close and understate it after a depeg.

/**
 * Loss versus holding, as a fraction (−0.0572 = −5.72%), for a price-ratio change `r`
 * (new A/B price ÷ entry A/B price). IL = 2·√r / (1 + r) − 1.
 */
export function impermanentLoss(r: number): number {
  if (!(r > 0) || !Number.isFinite(r)) throw new Error('The price ratio must be a positive number.')
  return (2 * Math.sqrt(r)) / (1 + r) - 1
}

export interface IlInput {
  /** Total value deposited, in the quote currency (USD). */
  deposit: number
  priceA0: number
  priceA1: number
  priceB0: number
  priceB1: number
}

export interface IlResult {
  /** Change of the A/B price ratio. */
  ratio: number
  il: number
  holdValue: number
  lpValue: number
  /** lpValue − holdValue (negative = loss). */
  difference: number
  /** Token amounts in the position at entry (half the deposit each) and now. */
  entry: { a: number, b: number }
  now: { a: number, b: number }
  /** Fees, as a share of the current position, needed to end up equal to holding. */
  breakEvenFees: number
}

export function validate(i: IlInput): string | null {
  for (const [k, v] of Object.entries(i)) {
    if (!Number.isFinite(v) || v <= 0) return `${LABELS[k as keyof IlInput]} must be a number above 0.`
  }
  return null
}

const LABELS: Record<keyof IlInput, string> = {
  deposit: 'Deposit',
  priceA0: 'Token A entry price',
  priceA1: 'Token A current price',
  priceB0: 'Token B entry price',
  priceB1: 'Token B current price'
}

export function simulate(i: IlInput): IlResult {
  const err = validate(i)
  if (err) throw new Error(err)
  const ratio = (i.priceA1 / i.priceB1) / (i.priceA0 / i.priceB0)
  const entry = { a: i.deposit / 2 / i.priceA0, b: i.deposit / 2 / i.priceB0 }
  // Constant product: a·b stays k, and the pool price b/a always equals the market A/B price.
  const k = entry.a * entry.b
  const p = i.priceA1 / i.priceB1
  const now = { a: Math.sqrt(k / p), b: Math.sqrt(k * p) }
  const holdValue = entry.a * i.priceA1 + entry.b * i.priceB1
  const lpValue = now.a * i.priceA1 + now.b * i.priceB1
  const il = impermanentLoss(ratio)
  return { ratio, il, holdValue, lpValue, difference: lpValue - holdValue, entry, now, breakEvenFees: holdValue / lpValue - 1 }
}

/** Simple (non-compounding) yearly fee rate that earns `fees` over `days`. */
export function breakEvenApr(fees: number, days: number): number {
  if (!(days > 0)) throw new Error('Days must be above 0.')
  return (fees * 365) / days
}

/** Points for the IL curve, log-spaced price-ratio changes from `min`× to `max`×. */
export function curve(min = 0.1, max = 10, n = 121): { r: number, il: number }[] {
  const out: { r: number, il: number }[] = []
  const a = Math.log(min)
  const b = Math.log(max)
  for (let k = 0; k < n; k++) {
    const r = Math.exp(a + ((b - a) * k) / (n - 1))
    out.push({ r, il: impermanentLoss(r) })
  }
  return out
}

/** Reference table rows, symmetric around 1× (a 2× move and a ½× move lose the same). */
export const REFERENCE_RATIOS = [1.1, 1.25, 1.5, 2, 3, 4, 5, 10]

export function formatMultiplier(r: number): string {
  return `${r >= 10 ? r.toFixed(1) : r >= 1 ? r.toFixed(2) : r.toPrecision(2)}×`
}
