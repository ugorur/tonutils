// Find every wallet a public key controls: derive the standard versions locally, then merge what the
// indexers know (toncenter walletStates / jetton wallets / NFT items, tonapi pubkeys/{key}/wallets).
import { Address } from '@ton/core'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { DerivedWallet } from '~/utils/ton/wallets'
import { addressesForPublicKey } from '~/utils/ton/wallets'
import { jettonDecimals } from '~/utils/ton/jetton'

export type ScanInput = { kind: 'publicKey', publicKey: string } | { kind: 'address', address: Address }

export function classifyScanInput(raw: string): ScanInput {
  const s = raw.trim()
  if (!s) throw new Error('Enter a wallet address or a public key')
  if (/^(0x)?[0-9a-f]{64}$/i.test(s)) return { kind: 'publicKey', publicKey: s.replace(/^0x/i, '').toLowerCase() }
  if (Address.isFriendly(s) || Address.isRaw(s)) return { kind: 'address', address: Address.parse(s) }
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s) && b.length === 32) return { kind: 'publicKey', publicKey: b.toString('hex') }
  throw new Error('Not a TON address or a 32-byte public key (64 hex characters)')
}

// ---------------------------------------------------------------- API shapes (only the fields we use)

export interface WalletStatesResponse { wallets: { address: string, status: string, balance: string, wallet_type?: string, seqno?: number }[] }
export interface JettonWalletsResponse {
  jetton_wallets: { address: string, balance: string, owner: string, jetton: string }[]
  metadata?: Record<string, { token_info?: { type?: string | null, symbol?: string | null, name?: string | null, extra?: { decimals?: string | number | null } | null }[] }>
}
export interface NftItemsResponse { nft_items: { owner_address: string }[] }
export interface TonapiPubkeyWallets { accounts: { address: string, balance: number | string, status: string, interfaces?: string[], stats?: { jettons_count?: number, nfts_count?: number } }[] }

export interface JettonHolding { master: string, symbol: string, decimals: number, amount: bigint }

export interface ScanRow {
  version: string
  label: string
  /** UQ… / 0Q… */
  address: string
  raw: string
  status: string
  balance: bigint
  jettons: JettonHolding[]
  /** null when unknown (only tonapi counts for indexed extras). */
  nfts: number | null
  jettonCount: number
  /** derived = one of the standard versions; indexed = found by tonapi for this key (custom subwallet etc). */
  source: 'derived' | 'indexed'
  isInput: boolean
}

const norm = (a: string) => Address.parse(a).toRawString()

export function deriveAll(publicKey: string, network: TonNetwork): DerivedWallet[] {
  return addressesForPublicKey(publicKey, network)
}

/** Every address to query toncenter for: derived ones plus extras tonapi knows. */
export function scanAddresses(derived: DerivedWallet[], indexed?: TonapiPubkeyWallets | null): string[] {
  const set = new Set(derived.map(d => d.raw))
  for (const a of indexed?.accounts ?? []) set.add(norm(a.address))
  return [...set]
}

export function buildRows(p: {
  derived: DerivedWallet[]
  states: WalletStatesResponse
  jettons: JettonWalletsResponse
  nfts: NftItemsResponse
  indexed?: TonapiPubkeyWallets | null
  input?: Address | null
  testOnly: boolean
}): ScanRow[] {
  const state = new Map(p.states.wallets.map(w => [norm(w.address), w]))
  const jettons = new Map<string, JettonHolding[]>()
  for (const j of p.jettons.jetton_wallets) {
    const meta = p.jettons.metadata?.[j.jetton]?.token_info?.find(t => t.type === 'jetton_masters')
    const owner = norm(j.owner)
    const list = jettons.get(owner) ?? []
    list.push({
      master: Address.parse(j.jetton).toString({ testOnly: p.testOnly }),
      symbol: meta?.symbol || meta?.name || 'Unknown jetton',
      decimals: jettonDecimals({ decimals: meta?.extra?.decimals }),
      amount: BigInt(j.balance)
    })
    jettons.set(owner, list)
  }
  const nftCount = new Map<string, number>()
  for (const n of p.nfts.nft_items) nftCount.set(norm(n.owner_address), (nftCount.get(norm(n.owner_address)) ?? 0) + 1)
  const inputRaw = p.input?.toRawString()

  const row = (raw: string, version: string, label: string, source: ScanRow['source'], fallback?: TonapiPubkeyWallets['accounts'][number]): ScanRow => {
    const s = state.get(raw)
    const js = jettons.get(raw) ?? []
    return {
      version,
      label,
      address: Address.parse(raw).toString({ bounceable: false, testOnly: p.testOnly }),
      raw,
      status: s?.status ?? fallback?.status ?? 'nonexist',
      balance: BigInt(s?.balance ?? fallback?.balance ?? 0),
      jettons: js,
      jettonCount: Math.max(js.length, fallback?.stats?.jettons_count ?? 0),
      nfts: nftCount.get(raw) ?? fallback?.stats?.nfts_count ?? 0,
      source,
      isInput: raw === inputRaw
    }
  }

  const rows = p.derived.map(d => row(d.raw, d.version, d.label, 'derived'))
  const known = new Set(rows.map(r => r.raw))
  for (const a of p.indexed?.accounts ?? []) {
    const raw = norm(a.address)
    if (known.has(raw)) continue
    const iface = a.interfaces?.find(i => i.startsWith('wallet')) ?? 'wallet'
    rows.push(row(raw, iface, `${iface.replace(/_/g, ' ')} (custom)`, 'indexed', a))
  }
  return rows
}

/** A row worth showing: deployed, or holding anything. */
export function hasActivity(r: ScanRow): boolean {
  return r.status === 'active' || r.status === 'frozen' || r.balance > 0n || r.jettonCount > 0 || (r.nfts ?? 0) > 0
}
