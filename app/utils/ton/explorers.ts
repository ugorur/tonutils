// Explorer deep links. Pure TS, no @ton/* imports: safe in pages and SSR.
// URL patterns checked 2026-10-22 (HTTP 200 with real addresses/hashes). dton.io no longer serves
// account/tx pages (404), so it is not listed. tonscan.com has no testnet.
import type { TonNetwork } from '~/composables/useTonNetwork'

export type ExplorerId = 'tonviewer' | 'tonscan' | 'tonscan-com' | 'getgems'
export type ExplorerKind = 'address' | 'tx' | 'nft' | 'collection' | 'jetton'

export interface ExplorerLink {
  id: ExplorerId
  name: string
  url: string
}

const NAMES: Record<ExplorerId, string> = {
  'tonviewer': 'Tonviewer',
  'tonscan': 'Tonscan',
  'tonscan-com': 'tonscan.com',
  'getgems': 'Getgems'
}

const BASE: Record<ExplorerId, Partial<Record<TonNetwork, string>>> = {
  'tonviewer': { mainnet: 'https://tonviewer.com', testnet: 'https://testnet.tonviewer.com' },
  'tonscan': { mainnet: 'https://tonscan.org', testnet: 'https://testnet.tonscan.org' },
  'tonscan-com': { mainnet: 'https://tonscan.com' },
  'getgems': { mainnet: 'https://getgems.io', testnet: 'https://testnet.getgems.io' }
}

const PATHS: Record<ExplorerId, Partial<Record<ExplorerKind, (v: string) => string>>> = {
  'tonviewer': { address: v => `/${v}`, tx: v => `/transaction/${v}`, nft: v => `/${v}`, collection: v => `/${v}`, jetton: v => `/${v}` },
  'tonscan': { address: v => `/address/${v}`, tx: v => `/tx/${v}`, nft: v => `/address/${v}`, collection: v => `/address/${v}`, jetton: v => `/jetton/${v}` },
  'tonscan-com': { address: v => `/${v}`, tx: v => `/transactions/${v}`, nft: v => `/${v}`, collection: v => `/${v}`, jetton: v => `/${v}` },
  'getgems': { address: v => `/user/${v}`, nft: v => `/nft/${v}`, collection: v => `/collection/${v}` }
}

/** Default explorers per kind, in display order. */
const DEFAULTS: Record<ExplorerKind, ExplorerId[]> = {
  address: ['tonviewer', 'tonscan', 'tonscan-com'],
  tx: ['tonviewer', 'tonscan', 'tonscan-com'],
  nft: ['getgems', 'tonviewer', 'tonscan'],
  collection: ['getgems', 'tonviewer', 'tonscan'],
  jetton: ['tonviewer', 'tonscan']
}

/** Transaction hashes: explorers take hex. Accepts hex, base64 or base64url. */
export function txHashHex(hash: string): string {
  const s = hash.trim()
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase()
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Array.from(bin, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

/** One explorer URL, or null when that explorer has no page of this kind on this network. */
export function explorerUrl(id: ExplorerId, kind: ExplorerKind, value: string, network: TonNetwork = 'mainnet'): string | null {
  const base = BASE[id][network]
  const path = PATHS[id][kind]
  if (!base || !path) return null
  return base + path(encodeURIComponent(kind === 'tx' ? txHashHex(value) : value))
}

/** Links for an address / tx / NFT / collection / jetton on every explorer that supports it. */
export function explorerLinks(kind: ExplorerKind, value: string, network: TonNetwork = 'mainnet', ids: ExplorerId[] = DEFAULTS[kind]): ExplorerLink[] {
  return ids.flatMap((id) => {
    const url = explorerUrl(id, kind, value, network)
    return url ? [{ id, name: NAMES[id], url }] : []
  })
}
