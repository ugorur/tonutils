import { formatUnits } from '~/utils/units'
import type { Verification } from '~/lib/jettons-read/core'
import { isRenounced } from '~/lib/jettons-read/core'

export { isRenounced }

/** toncenter v3 /jetton/masters item. */
export interface ToncenterJettonMaster {
  address: string
  total_supply: string
  mintable: boolean
  admin_address: string | null
  /** Decoded TEP-64 content. On-chain keys as strings; off-chain content shows up as { uri }. */
  jetton_content: Record<string, string>
  jetton_wallet_code_hash: string
  code_hash: string
}

export type MetadataKind = 'onchain' | 'offchain' | 'hybrid'

export interface MetadataSource {
  kind: MetadataKind
  label: string
  uri?: string
  /** The off-chain JSON sits on a normal web server whose owner can change it at any time. */
  mutable: boolean
}

/** TEP-64: no uri = fully on-chain; only a uri = off-chain JSON; uri plus on-chain keys = hybrid ("semi-chain"). */
export function metadataSource(content: Record<string, string> | null | undefined): MetadataSource {
  const keys = Object.keys(content ?? {})
  const uri = content?.uri
  if (!uri) return { kind: 'onchain', label: 'Fully on-chain', mutable: false }
  const mutable = !/^(ipfs|ar):\/\//i.test(uri)
  if (keys.some(k => k !== 'uri')) return { kind: 'hybrid', label: 'On-chain fields + off-chain JSON', uri, mutable }
  return { kind: 'offchain', label: 'Off-chain JSON', uri, mutable }
}

export interface TrustSignal {
  level: 'good' | 'info' | 'warn' | 'bad'
  title: string
  text: string
}

export interface TrustInput {
  verification: Verification
  admin: string | null | undefined
  mintable: boolean
  /** Holders' wallets run governed (stablecoin) code: the admin can lock them. */
  governed: boolean
  /** null when unknown (indexer unreachable). */
  source: MetadataSource | null
}

/** Plain-language checks a regular user should see before trusting a token. */
export function trustSignals(t: TrustInput): TrustSignal[] {
  const out: TrustSignal[] = []
  if (t.verification === 'blacklist') out.push({ level: 'bad', title: 'Flagged as a scam', text: 'tonapi marks this token as a scam or an impersonation. Do not buy it or open links it points to.' })
  else if (t.verification === 'whitelist') out.push({ level: 'good', title: 'Verified token', text: 'Listed as genuine in the Tonkeeper / tonapi token list.' })
  else out.push({ level: 'warn', title: 'Not verified', text: 'Anyone can deploy a token with any name and logo. Compare the master address with the one the project publishes.' })

  if (isRenounced(t.admin)) {
    out.push({ level: 'good', title: 'Admin renounced', text: 'No one controls the contract: the supply can never grow and the on-chain metadata is fixed.' })
  }
  else {
    out.push({
      level: t.mintable ? 'warn' : 'info',
      title: t.mintable ? 'Admin can mint more' : 'Has an admin',
      text: t.mintable
        ? 'The admin address can create new tokens at any time and change the metadata.'
        : 'Minting is switched off, but the admin can still change the metadata and may be able to turn minting back on.'
    })
  }
  // A governed token with a renounced admin has nobody left to send set_status.
  if (t.governed && !isRenounced(t.admin)) out.push({ level: 'info', title: 'Issuer can freeze wallets', text: 'This is a governed token (like USD₮): the admin can lock any holder\'s wallet, and move or burn its tokens.' })
  if (t.source?.mutable && t.source.uri) out.push({ level: 'info', title: 'Metadata hosted on a website', text: 'Name, logo or description come from a web server and can change without an on-chain transaction.' })
  return out
}

/** tonapi diff strings use a Unicode minus: "−0.04%" -> -0.04. */
export function parseDiff(s: string | undefined): number | undefined {
  if (!s) return undefined
  const n = Number.parseFloat(s.replace('−', '-').replace('%', ''))
  return Number.isFinite(n) ? n : undefined
}

/** Fully diluted value: supply (base units) × price. Float is fine for display. */
export function marketCap(totalSupply: bigint, decimals: number, price: number): number {
  return Number(formatUnits(totalSupply, decimals)) * price
}

/** tonapi /rates/chart points come newest first as [unix, price]; uPlot wants ascending columns. */
export function chartColumns(points: [number, number][]): [number[], number[]] {
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  return [sorted.map(p => p[0]), sorted.map(p => p[1])]
}

/** DexScreener /latest/dex/tokens/{addr} pair (fields we use). */
export interface DexPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: { address: string, symbol: string }
  quoteToken: { address: string, symbol: string }
  priceUsd?: string
  liquidity?: { usd?: number }
  volume?: { h24?: number }
}

const DEX_NAMES: Record<string, string> = { stonfi: 'STON.fi', dedust: 'DeDust', tonco: 'TONCO' }

export interface PoolRow {
  dex: string
  pair: string
  address: string
  liquidity: number
  volume24h: number
  url: string
}

/** TON pools that actually hold liquidity, deepest first. */
export function topPools(pairs: DexPair[] | null | undefined, limit = 8): PoolRow[] {
  return (pairs ?? [])
    .filter(p => p.chainId === 'ton' && (p.liquidity?.usd ?? 0) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
    .slice(0, limit)
    .map(p => ({
      dex: DEX_NAMES[p.dexId] ?? p.dexId,
      pair: `${p.baseToken.symbol} / ${p.quoteToken.symbol}`,
      address: p.pairAddress,
      liquidity: p.liquidity?.usd ?? 0,
      volume24h: p.volume?.h24 ?? 0,
      url: p.url
    }))
}

/** "$1.23M"-style compact USD for big numbers, plain for prices. */
export function usd(n: number, { compact = false } = {}): string {
  if (!Number.isFinite(n)) return '—'
  if (compact) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n)
  const digits = n === 0 ? 2 : n >= 1 ? 4 : Math.min(12, 2 - Math.floor(Math.log10(n)) + 2)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(n)
}
