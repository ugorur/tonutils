// Assets shared by the prices/DeFi tools: GRAM, jettons and (for the converter) fiat currencies.
// Imports @ton/core: use from Tool.vue / logic.ts only.
import { Address } from '@ton/core'
import { rateLimitedJson } from '~/utils/api-client'
import { COIN_DECIMALS, COIN_NAME, COIN_SYMBOL } from '~/utils/currency'
import { KNOWN_JETTONS, jettonDecimals } from '~/utils/ton/jetton'

export interface Asset {
  kind: 'native' | 'jetton' | 'fiat'
  /** Jetton master (bounceable EQ…), fiat code (USD) or '' for GRAM. */
  address: string
  symbol: string
  name: string
  decimals: number
  image?: string
  /** tonapi verification: whitelist | none | blacklist. */
  verification?: string
}

/** How STON.fi, DexScreener and others write native GRAM: the zero address. */
export const NATIVE_ZERO = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'

export const NATIVE: Asset = { kind: 'native', address: '', symbol: COIN_SYMBOL, name: COIN_NAME, decimals: COIN_DECIMALS, verification: 'whitelist' }

export const POPULAR: Asset[] = [
  NATIVE,
  ...KNOWN_JETTONS.map(j => ({ kind: 'jetton' as const, address: j.master, symbol: j.symbol, name: j.name, decimals: j.decimals, verification: 'whitelist' }))
]

// Currencies tonapi /v2/rates returns (checked 2026-10-23). BTC/ETH are crypto but priced the same way.
export const FIAT_CODES = ['USD', 'EUR', 'GBP', 'TRY', 'RUB', 'UAH', 'KZT', 'UZS', 'BYN', 'GEL', 'AMD', 'INR', 'CNY', 'JPY', 'KRW', 'IDR', 'VND', 'THB', 'SGD', 'HKD', 'AED', 'NGN', 'BRL', 'CAD', 'AUD', 'CHF', 'PLN', 'BTC', 'ETH'] as const

const fiatNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' })
  }
  catch {
    return null
  }
})()

export function fiatAsset(code: string): Asset {
  const crypto = code === 'BTC' || code === 'ETH'
  return { kind: 'fiat', address: code, symbol: code, name: code === 'BTC' ? 'Bitcoin' : code === 'ETH' ? 'Ether' : (fiatNames?.of(code) ?? code), decimals: crypto ? 8 : 2 }
}

export const FIATS: Asset[] = FIAT_CODES.map(fiatAsset)

/** Bounceable EQ… form of a jetton master. Throws on an invalid address. */
export function normalizeMaster(address: string): string {
  return Address.parse(address.trim()).toString({ bounceable: true, urlSafe: true })
}

export function isNativeAddress(address: string): boolean {
  if (address === 'native' || address === '') return true
  try {
    const a = Address.parse(address)
    return a.workChain === 0 && a.hash.every(b => b === 0)
  }
  catch {
    return false
  }
}

/** Stable id: 'native', 'fiat:USD' or the EQ… master. */
export function assetKey(a: Asset): string {
  return a.kind === 'native' ? 'native' : a.kind === 'fiat' ? `fiat:${a.address}` : a.address
}

export function sameAsset(a: Asset, b: Asset): boolean {
  return assetKey(a) === assetKey(b)
}

/** API ids per service. */
export const ids = {
  tonapi: (a: Asset) => (a.kind === 'native' ? 'TON' : a.address),
  stonfi: (a: Asset) => (a.kind === 'native' ? NATIVE_ZERO : a.address),
  dedust: (a: Asset) => (a.kind === 'native' ? 'native' : `jetton:${Address.parse(a.address).toRawString()}`),
  swapCoffee: (a: Asset) => (a.kind === 'native' ? 'native' : a.address),
  /** STON.fi/DeDust app URLs take "TON" for the native coin. */
  app: (a: Asset) => (a.kind === 'native' ? 'TON' : a.address)
}

/** tonapi GET /v2/jettons/{master} (fields we use). */
export interface TonapiJettonMeta {
  metadata: { address: string, name?: string, symbol?: string, decimals?: string, image?: string }
  preview?: string
  verification?: string
}

export function assetFromTonapi(j: TonapiJettonMeta): Asset {
  return {
    kind: 'jetton',
    address: normalizeMaster(j.metadata.address),
    symbol: j.metadata.symbol || '?',
    name: j.metadata.name || 'Unnamed token',
    decimals: jettonDecimals(j.metadata),
    image: j.preview ?? j.metadata.image,
    verification: j.verification ?? 'none'
  }
}

/** Rate-limited JSON for the DEX/price APIs (STON.fi, DeDust, swap.coffee, DexScreener). Throws TonApiError. */
export function defiJson<T>(url: string, provider: string, opts: { post?: boolean, body?: unknown } = {}): Promise<T> {
  return rateLimitedJson<T>(url, { provider, minIntervalMs: 350 }, opts.post
    ? { method: 'POST', ...(opts.body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) }) }
    : undefined)
}

/** Decimal number from an API (may be a float like 114.44302978515624) to base units, truncating. */
export function floatToUnits(value: number | string, decimals: number): bigint {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid amount ${value}`)
  const [int, frac = ''] = n.toFixed(Math.min(decimals, 20)).split('.')
  return BigInt(int! + frac.padEnd(decimals, '0').slice(0, decimals))
}

/** Human number from base units for display math (not for money logic). */
export function unitsToNumber(units: bigint, decimals: number): number {
  return Number(units) / 10 ** decimals
}

/** "−1.52%" (tonapi uses U+2212) -> -1.52. */
export function parsePercent(s: string | undefined | null): number | null {
  if (!s) return null
  const n = Number(s.replace('−', '-').replace('%', '').trim())
  return Number.isFinite(n) ? n : null
}

/** Compact price: 1.3225 -> "1.3225", 0.000392 -> "0.000392", 12345.6 -> "12,345.60". */
export function formatPrice(n: number, maxSig = 6): string {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return n.toLocaleString('en-US', { maximumSignificantDigits: maxSig })
}

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`
  return `$${formatPrice(n, 4)}`
}

/** Minimum output after a slippage tolerance (fraction, e.g. 0.01), rounded down. */
export function applySlippage(out: bigint, slippage: number): bigint {
  const bps = BigInt(Math.round(slippage * 10000))
  return out * (10000n - bps) / 10000n
}
