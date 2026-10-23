// TonConnect wallets list + bridge status. Spec: ton-blockchain/ton-connect spec/wallets-list.md and bridge.md.
// Pure TS, no Vue, no @ton/*.
import type { FeatureSummary } from '~/lib/dev-tonconnect/features'
import { summarizeFeatures } from '~/lib/dev-tonconnect/features'

/** config.ton.org is what @tonconnect/sdk fetches; the GitHub file is the source it is published from. Both send ACAO *. */
export const WALLET_LIST_URLS = [
  'https://config.ton.org/wallets-v2.json',
  'https://raw.githubusercontent.com/ton-blockchain/wallets-list/main/wallets-v2.json'
]

export const PLATFORMS = ['ios', 'android', 'chrome', 'firefox', 'safari', 'macos', 'windows', 'linux'] as const
export type Platform = typeof PLATFORMS[number]
export const PLATFORM_LABELS: Record<Platform, string> = {
  ios: 'iOS', android: 'Android', chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari', macos: 'macOS', windows: 'Windows', linux: 'Linux'
}

export interface WalletRow {
  appName: string
  name: string
  image: string
  aboutUrl: string
  universalUrl?: string
  deepLink?: string
  tondns?: string
  /** HTTP bridge URL (normalized, no trailing slash). */
  sseBridge?: string
  /** window[key].tonconnect for in-app browsers and extensions. */
  jsKey?: string
  platforms: string[]
  features: FeatureSummary
  /** Entry problems against the wallets-list spec. */
  issues: string[]
}

type Raw = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const https = (v: unknown) => typeof v === 'string' && /^https:\/\/.+/.test(v)
export const normalizeBridge = (url: string) => url.trim().replace(/\/+$/, '')

/** Parses wallets-v2.json. Throws if it is not an array. */
export function parseWalletList(json: unknown): WalletRow[] {
  if (!Array.isArray(json)) throw new Error('The wallets list is not a JSON array.')
  return json.filter((x): x is Raw => typeof x === 'object' && x !== null).map((w) => {
    const bridges = Array.isArray(w.bridge) ? w.bridge.filter((b): b is Raw => typeof b === 'object' && b !== null) : []
    const sse = bridges.find(b => b.type === 'sse')
    const js = bridges.find(b => b.type === 'js')
    const platforms = Array.isArray(w.platforms) ? w.platforms.filter((p): p is string => typeof p === 'string') : []
    const features = Array.isArray(w.features) ? w.features : []
    const issues: string[] = []
    if (!str(w.app_name)) issues.push('app_name is missing')
    if (!str(w.name)) issues.push('name is missing')
    if (!https(w.image) || !/\.png$/.test(String(w.image))) issues.push('image must be an https URL ending in .png')
    if (!https(w.about_url)) issues.push('about_url must be an https URL')
    if (bridges.length < 1 || bridges.length > 2) issues.push('bridge must list one or two entries')
    if (sse && !https(sse.url)) issues.push('sse bridge url must be https')
    if (sse && !https(w.universal_url)) issues.push('universal_url is required with an sse bridge')
    if (js && !str(js.key)) issues.push('js bridge has no key')
    if (!platforms.length) issues.push('platforms is empty')
    const unknown = platforms.filter(p => !(PLATFORMS as readonly string[]).includes(p))
    if (unknown.length) issues.push(`unknown platform: ${unknown.join(', ')}`)
    if (!features.length) issues.push('features is empty')
    return {
      appName: str(w.app_name) ?? '',
      name: str(w.name) ?? str(w.app_name) ?? '(unnamed)',
      // Remote data: only https URLs reach src/href (no javascript: links).
      image: https(w.image) ? w.image as string : '',
      aboutUrl: https(w.about_url) ? w.about_url as string : '',
      universalUrl: str(w.universal_url),
      deepLink: str(w.deepLink),
      tondns: str(w.tondns),
      sseBridge: typeof sse?.url === 'string' ? normalizeBridge(sse.url) : undefined,
      jsKey: str(js?.key),
      platforms,
      features: summarizeFeatures(features),
      issues
    }
  })
}

/** Distinct HTTP bridges, each with the wallets that use it, sorted by usage. */
export function uniqueBridges(rows: WalletRow[]): { url: string, wallets: string[] }[] {
  const m = new Map<string, string[]>()
  for (const r of rows) if (r.sseBridge) m.set(r.sseBridge, [...(m.get(r.sseBridge) ?? []), r.name])
  return [...m].map(([url, wallets]) => ({ url, wallets })).sort((a, b) => b.wallets.length - a.wallets.length || a.url.localeCompare(b.url))
}

/** 32 random bytes as hex: a throwaway client_id (bridge.md: client_id is a hex public key). */
export function randomClientId(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** GET /events subscription URL (bridge.md § GET /events). heartbeat=message makes heartbeats visible to EventSource. */
export function eventsUrl(bridge: string, clientId: string): string {
  return `${normalizeBridge(bridge)}/events?client_id=${clientId}&heartbeat=message`
}

export interface WalletFilter { q: string, platform: string, signData: boolean, extraCurrency: boolean }

export function filterWallets(rows: WalletRow[], f: WalletFilter): WalletRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter(r =>
    (!q || [r.name, r.appName, r.sseBridge, r.jsKey, r.tondns].some(v => v?.toLowerCase().includes(q)))
    && (!f.platform || r.platforms.includes(f.platform))
    && (!f.signData || r.features.signData.length > 0)
    && (!f.extraCurrency || !!r.features.sendTransaction?.extraCurrency))
}

/** Flat rows for CSV export. */
export function toCsvRows(rows: WalletRow[]) {
  return rows.map(r => ({
    name: r.name,
    app_name: r.appName,
    platforms: r.platforms.join(' '),
    max_messages: r.features.sendTransaction?.maxMessages ?? '',
    extra_currency: r.features.sendTransaction?.extraCurrency ?? false,
    sign_data: r.features.signData.join(' '),
    sign_message: !!r.features.signMessage,
    sse_bridge: r.sseBridge ?? '',
    js_key: r.jsKey ?? '',
    universal_url: r.universalUrl ?? '',
    about_url: r.aboutUrl
  }))
}
