// Token list: swap.coffee token API (keyless, CORS *) -> rows. Pure TS, no @ton/* imports.
import type { CsvRow } from '~/utils/csv'

export const API = 'https://tokens.swap.coffee/api/v3/hybrid-search'
export const PAGE_SIZE = 50

export type SortKey = 'TVL' | 'MCAP' | 'FDMC' | 'VOLUME_24H' | 'PRICE_CHANGE_24H'
export type VerificationLevel = 'verified' | 'community' | 'all'

export const SORTS: { value: SortKey, label: string }[] = [
  { value: 'TVL', label: 'Liquidity (TVL)' },
  { value: 'MCAP', label: 'Market cap' },
  { value: 'VOLUME_24H', label: '24h volume' },
  { value: 'FDMC', label: 'Fully diluted value' },
  { value: 'PRICE_CHANGE_24H', label: '24h price change' }
]

export const LEVELS: { value: VerificationLevel, label: string }[] = [
  { value: 'verified', label: 'Verified only' },
  { value: 'community', label: 'Verified + community' },
  { value: 'all', label: 'All, including unverified' }
]

/** swap.coffee wants one `verification=` per value. ALL-kind searches must include COMMUNITY. */
export function listUrl(p: { search?: string, sort: SortKey, level: VerificationLevel, page: number, size?: number }): string {
  const q = new URLSearchParams()
  const search = p.search?.trim()
  if (search) {
    q.set('search', search)
    q.set('kind', 'ALL')
  }
  else {
    q.set('kind', 'DEXES')
    q.set('sort', p.sort)
    if (p.sort === 'PRICE_CHANGE_24H') q.set('direction', 'DESC')
  }
  const levels = { verified: ['WHITELISTED'], community: ['WHITELISTED', 'COMMUNITY'], all: ['WHITELISTED', 'COMMUNITY', 'UNKNOWN'] }[p.level]
  if (search && !levels.includes('COMMUNITY')) levels.push('COMMUNITY')
  for (const v of levels) q.append('verification', v)
  q.set('size', String(p.size ?? PAGE_SIZE))
  q.set('page', String(p.page))
  return `${API}?${q}`
}

/** One item of the hybrid-search response (common jetton; memepad items have fewer fields). */
export interface ApiJetton {
  type: string
  address: string
  name?: string
  symbol?: string
  decimals?: number
  total_supply?: string
  mintable?: boolean
  verification?: string
  image_url?: string
  created_at?: string
  market_stats?: {
    holders_count?: number
    price_usd?: number
    price_change_24h?: number
    volume_usd_24h?: number
    tvl_usd?: number
    mcap?: number
    fdmc?: number
    trust_score?: number
  } | null
}

export interface TokenRow {
  /** Raw 0:… lowercase. */
  raw: string
  name: string
  symbol: string
  decimals: number
  image?: string
  verification: 'verified' | 'community' | 'unverified' | 'scam'
  native: boolean
  mintable?: boolean
  holders?: number
  price?: number
  change24h?: number
  volume24h?: number
  tvl?: number
  mcap?: number
  fdv?: number
  trust?: number
}

const NATIVE_RAW = `0:${'0'.repeat(64)}`

const VERIFICATION: Record<string, TokenRow['verification']> = {
  WHITELISTED: 'verified', COMMUNITY: 'community', UNKNOWN: 'unverified', BLACKLISTED: 'scam'
}

/**
 * cdn.swap.coffee (imgproxy) answers 403 to other sites, so use the original image it wraps:
 * the last path segment is the base64url source URL. Other hosts are kept as they are.
 */
export function imageUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith('https://cdn.swap.coffee/')) return url
  const seg = url.split('/').pop()!.replace(/\.[a-z]+$/, '')
  try {
    const src = atob(seg.replace(/-/g, '+').replace(/_/g, '/'))
    return /^https:\/\/[\x21-\x7e]+$/.test(src) ? src : undefined
  }
  catch {
    return undefined
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export function toRows(items: ApiJetton[]): TokenRow[] {
  return items.filter(i => typeof i.address === 'string' && i.address.includes(':')).map((i) => {
    const s = i.market_stats ?? {}
    const raw = i.address.toLowerCase()
    return {
      raw,
      name: i.name?.trim() || 'Unnamed',
      symbol: i.symbol?.trim() || '?',
      decimals: i.decimals ?? 9,
      image: imageUrl(i.image_url),
      verification: VERIFICATION[i.verification ?? ''] ?? 'unverified',
      native: raw === NATIVE_RAW,
      mintable: i.mintable,
      // swap.coffee reports 0 holders for the native coin
      holders: raw === NATIVE_RAW ? undefined : num(s.holders_count),
      price: num(s.price_usd),
      change24h: num(s.price_change_24h),
      volume24h: num(s.volume_usd_24h),
      tvl: num(s.tvl_usd),
      mcap: num(s.mcap),
      fdv: num(s.fdmc),
      trust: num(s.trust_score)
    }
  })
}

/** Adds a page, dropping tokens already shown (pages can overlap when the ranking moves). */
export function mergeRows(prev: TokenRow[], next: TokenRow[]): TokenRow[] {
  const seen = new Set(prev.map(r => r.raw))
  return [...prev, ...next.filter(r => !seen.has(r.raw) && seen.add(r.raw))]
}

/** "$1.23B", "$45.6K", "$0.000123". */
export function usd(v: number | undefined): string {
  if (v === undefined) return '—'
  const a = Math.abs(v)
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `$${(v / 1e3).toFixed(1)}K`
  if (a >= 1) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (a === 0) return '$0'
  // 3 significant digits without exponent notation: 1.41e-9 -> $0.00000000141
  return `$${v.toFixed(Math.min(20, 2 - Math.floor(Math.log10(a))))}`
}

export function pct(v: number | undefined): string {
  if (v === undefined) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function csvRows(rows: TokenRow[], friendly: (raw: string) => string): CsvRow[] {
  return rows.map((r, i) => ({
    rank: i + 1,
    symbol: r.symbol,
    name: r.name,
    master: r.native ? '' : friendly(r.raw),
    raw: r.raw,
    decimals: r.decimals,
    verification: r.verification,
    price_usd: r.price ?? '',
    change_24h_pct: r.change24h ?? '',
    volume_24h_usd: r.volume24h ?? '',
    tvl_usd: r.tvl ?? '',
    mcap_usd: r.mcap ?? '',
    holders: r.holders ?? ''
  }))
}
