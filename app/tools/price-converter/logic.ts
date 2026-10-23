// Price conversion between GRAM, jettons and fiat using tonapi /v2/rates. GRAM is the pivot:
// every asset is turned into "GRAM per 1 unit", so any pair converts with one division.
import type { Asset } from '~/lib/prices-defi/assets'
import { FIAT_CODES, ids, parsePercent } from '~/lib/prices-defi/assets'

export interface TonapiRate {
  prices?: Record<string, number>
  diff_24h?: Record<string, string>
  diff_7d?: Record<string, string>
  diff_30d?: Record<string, string>
}
export interface TonapiRates { rates: Record<string, TonapiRate> }

/** Query for GET /v2/rates covering both assets and every listed currency. */
export function ratesQuery(assets: Asset[]): { tokens: string, currencies: string } {
  const tokens = new Set(['ton'])
  for (const a of assets) if (a.kind === 'jetton') tokens.add(a.address)
  return { tokens: [...tokens].join(','), currencies: ['ton', ...FIAT_CODES].join(',').toLowerCase() }
}

/** How many GRAM one unit of the asset is worth, or null when tonapi has no price. */
export function gramPer(a: Asset, r: TonapiRates): number | null {
  if (a.kind === 'native') return 1
  if (a.kind === 'fiat') {
    const p = r.rates.TON?.prices?.[a.address]
    return p ? 1 / p : null
  }
  const p = r.rates[a.address]?.prices?.TON
  return p && p > 0 ? p : null
}

export function convert(amount: number, from: Asset, to: Asset, r: TonapiRates): number | null {
  const f = gramPer(from, r)
  const t = gramPer(to, r)
  return f === null || t === null ? null : amount * f / t
}

export interface PriceChange { d24: number | null, d7: number | null, d30: number | null }

/** Change of `token` priced in `quote` (a fiat or GRAM), as tonapi reports it. Null for fiat/fiat or GRAM/GRAM. */
export function priceChange(token: Asset, quote: Asset, r: TonapiRates): PriceChange | null {
  if (token.kind === 'fiat' || quote.kind === 'jetton' || (token.kind === 'native' && quote.kind === 'native')) return null
  const rate = r.rates[ids.tonapi(token)]
  const key = quote.kind === 'native' ? 'TON' : quote.address
  if (!rate?.diff_24h?.[key]) return null
  return { d24: parsePercent(rate.diff_24h[key]), d7: parsePercent(rate.diff_7d?.[key]), d30: parsePercent(rate.diff_30d?.[key]) }
}
