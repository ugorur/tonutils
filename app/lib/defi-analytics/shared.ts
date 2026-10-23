// Shared by the defi-analytics tools (rich list, whale watch, supply stats, LP viewer). Pure TS, no Vue.
import { rateLimitedJson } from '~/utils/api-client'

/** JSON from a non-TON public API (CoinGecko, STON.fi, GitHub) with the shared per-host queue and retry. */
export function publicJson<T>(url: string, provider: string, minIntervalMs = 400): Promise<T> {
  return rateLimitedJson<T>(url, { provider, minIntervalMs })
}

// ---------- known account labels (tonkeeper/ton-assets, the list tonapi and Tonkeeper use) ----------

export const KNOWN_ACCOUNTS_URL = 'https://raw.githubusercontent.com/tonkeeper/ton-assets/main/accounts.json'
export const KNOWN_ACCOUNTS_SOURCE = 'https://github.com/tonkeeper/ton-assets'

/** raw (lowercase "0:…") -> name. Mainnet addresses only. */
export function parseKnownAccounts(list: { address: string, name: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of list) {
    if (a?.address && a.name) m.set(a.address.toLowerCase(), a.name)
  }
  return m
}

let known: Promise<Map<string, string>> | null = null
/** Loaded once per page; resolves to an empty map if GitHub is unreachable (labels are a nice-to-have). */
export function loadKnownAccounts(): Promise<Map<string, string>> {
  known ??= publicJson<{ address: string, name: string }[]>(KNOWN_ACCOUNTS_URL, 'GitHub')
    .then(parseKnownAccounts, () => {
      known = null
      return new Map<string, string>()
    })
  return known
}

/** Workchain -1: elector, config, validators and other system contracts. */
export function isMasterchain(raw: string): boolean {
  return raw.startsWith('-1:')
}

// ---------- GRAM market data (CoinGecko, id still "the-open-network") ----------

export const COINGECKO_COIN_URL = 'https://api.coingecko.com/api/v3/coins/the-open-network?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'
export const COINGECKO_PAGE = 'https://www.coingecko.com/en/coins/gram'

export interface GramMarket {
  name: string
  priceUsd: number
  change24h: number | null
  marketCapUsd: number
  fdvUsd: number | null
  rank: number | null
  /** Whole coins (CoinGecko reports floats). */
  totalSupply: number
  circulatingSupply: number
  maxSupply: number | null
  athUsd: number | null
  athDate: string | null
  updatedAt: string
}

interface CoinGeckoCoin {
  name: string
  market_cap_rank?: number | null
  last_updated: string
  market_data: {
    current_price: { usd: number }
    price_change_percentage_24h?: number | null
    market_cap: { usd: number }
    fully_diluted_valuation?: { usd?: number }
    total_supply: number
    circulating_supply: number
    max_supply?: number | null
    ath?: { usd?: number }
    ath_date?: { usd?: string }
  }
}

export function parseGramMarket(c: CoinGeckoCoin): GramMarket {
  const m = c.market_data
  if (!m?.current_price?.usd || !m.total_supply) throw new Error('CoinGecko returned no market data for GRAM.')
  return {
    name: c.name,
    priceUsd: m.current_price.usd,
    change24h: m.price_change_percentage_24h ?? null,
    marketCapUsd: m.market_cap.usd,
    fdvUsd: m.fully_diluted_valuation?.usd ?? null,
    rank: c.market_cap_rank ?? null,
    totalSupply: m.total_supply,
    circulatingSupply: m.circulating_supply,
    maxSupply: m.max_supply ?? null,
    athUsd: m.ath?.usd ?? null,
    athDate: m.ath_date?.usd ?? null,
    updatedAt: c.last_updated
  }
}

export async function fetchGramMarket(): Promise<GramMarket> {
  // CoinGecko's keyless tier allows ~5-15 calls a minute per visitor, so space calls out generously.
  return parseGramMarket(await publicJson<CoinGeckoCoin>(COINGECKO_COIN_URL, 'CoinGecko', 4000))
}

/** 1234567 -> "1.23M", 5271060131 -> "5.27B". */
export function compactNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits }).format(n)
}

/** Whole-coin integer part of a nano amount as a JS number, for display ratios only (never money math). */
export function nanoToNumber(nano: bigint, decimals = 9): number {
  return Number(nano) / 10 ** decimals
}
