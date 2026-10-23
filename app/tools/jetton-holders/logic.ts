import type { TonapiAccountRef } from '~/lib/jettons-read/core'
import { sameAddress, ZERO_RAW } from '~/lib/jettons-read/core'

/** tonapi GET /v2/jettons/{master}/holders item. `address` is the jetton wallet, `owner` the holder. */
export interface TonapiHolder {
  address: string
  owner: TonapiAccountRef
  balance: string
}

export type HolderKind = 'burn' | 'master' | 'exchange' | 'contract' | 'scam' | 'wallet'

export const KIND_LABELS: Record<HolderKind, string> = {
  burn: 'Burn address',
  master: 'Token contract',
  exchange: 'Exchange',
  contract: 'Contract',
  scam: 'Scam',
  wallet: ''
}

// ponytail: exchange detection is a name match on tonapi's public account labels. Add names as they appear.
const EXCHANGE_RE = /binance|okx|bybit|mexc|bitget|gate\.io|\bgate\b|kucoin|htx|huobi|crypto\.com|coinbase|kraken|bingx|bitfinex|bitmart|lbank|bitrue|whitebit|\bxt\b|wallet in telegram|@wallet|cryptobot|xrocket|fragment/i

export function holderKind(owner: TonapiAccountRef, masterRaw: string): HolderKind {
  if (sameAddress(owner.address, ZERO_RAW)) return 'burn'
  if (sameAddress(owner.address, masterRaw)) return 'master'
  if (owner.is_scam) return 'scam'
  if (owner.name && EXCHANGE_RE.test(owner.name)) return 'exchange'
  if (owner.is_wallet === false) return 'contract'
  return 'wallet'
}

export interface HolderRow {
  rank: number
  owner: string
  wallet: string
  name?: string
  kind: HolderKind
  balance: bigint
  /** Percent of total supply (0–100). */
  share: number
}

/** Percent with 4 decimals from exact bigints. */
export function sharePercent(balance: bigint, supply: bigint): number {
  if (supply <= 0n) return 0
  return Number((balance * 1_000_000n) / supply) / 10_000
}

export function buildHolders(holders: TonapiHolder[], supply: bigint, masterRaw: string, offset = 0): HolderRow[] {
  return holders.map((h, i) => {
    const balance = BigInt(h.balance)
    return {
      rank: offset + i + 1,
      owner: h.owner.address,
      wallet: h.address,
      name: h.owner.name,
      kind: holderKind(h.owner, masterRaw),
      balance,
      share: sharePercent(balance, supply)
    }
  })
}

export type ConcentrationLevel = 'high' | 'moderate' | 'low'

export interface Concentration {
  top1: number
  top10: number
  top50: number
  top100: number
  /** Top-10 share counting only ordinary wallets (no exchanges, contracts, burn address, token contract). */
  top10Wallets: number
  level: ConcentrationLevel
}

/** Score is the top-10 share: 50 % or more is high, 25 % or more moderate, else low. */
export function concentration(rows: HolderRow[]): Concentration {
  const sum = (xs: HolderRow[]) => xs.reduce((a, r) => a + r.share, 0)
  const top10 = sum(rows.slice(0, 10))
  return {
    top1: sum(rows.slice(0, 1)),
    top10,
    top50: sum(rows.slice(0, 50)),
    top100: sum(rows.slice(0, 100)),
    top10Wallets: sum(rows.filter(r => r.kind === 'wallet').slice(0, 10)),
    level: top10 >= 50 ? 'high' : top10 >= 25 ? 'moderate' : 'low'
  }
}

export function formatShare(p: number): string {
  if (p > 0 && p < 0.0001) return '<0.0001%'
  return `${p.toFixed(p >= 10 ? 2 : 4).replace(/\.?0+$/, '')}%`
}
