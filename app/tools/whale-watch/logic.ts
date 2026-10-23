// Whale watch: large GRAM and USD₮ transfers from the toncenter v3 indexer. Pure TS, no Vue.

export type WhaleAsset = 'coin' | 'usdt'

export const USDT_DECIMALS = 6

export interface Transfer {
  /** Unique per asset: action id (GRAM) or transaction hash (USD₮). */
  id: string
  asset: WhaleAsset
  /** Base units: nanoGRAM or USD₮ micro-units. */
  amount: bigint
  /** Lowercase raw addresses (for USD₮: the owners, not their jetton wallets). */
  from: string
  to: string
  /** Unix seconds. */
  time: number
  lt: bigint
  /** Base64 transaction hash for explorer links. */
  tx: string
  comment?: string
}

/** toncenter /api/v3/actions?action_type=ton_transfer (fields used). */
export interface ToncenterActions {
  actions: {
    action_id: string
    start_lt: string
    start_utime: number
    success: boolean
    type: string
    transactions: string[]
    details: { source: string, destination: string, value: string, comment?: string | null, encrypted?: boolean }
  }[]
  address_book?: AddressBook
}

/** toncenter /api/v3/jetton/transfers (fields used). */
export interface ToncenterJettonTransfers {
  jetton_transfers: {
    source: string
    destination: string
    amount: string
    transaction_hash: string
    transaction_lt: string
    transaction_now: number
    transaction_aborted: boolean
    decoded_forward_payload?: { comment?: string } | null
  }[]
  address_book?: AddressBook
}

export type AddressBook = Record<string, { user_friendly: string, domain: string | null }>

export function fromTonActions(r: ToncenterActions): Transfer[] {
  return r.actions
    .filter(a => a.type === 'ton_transfer' && a.success && a.details?.source && a.details.destination)
    .map(a => ({
      id: a.action_id,
      asset: 'coin' as const,
      amount: BigInt(a.details.value),
      from: a.details.source.toLowerCase(),
      to: a.details.destination.toLowerCase(),
      time: a.start_utime,
      lt: BigInt(a.start_lt),
      tx: a.transactions[0] ?? '',
      comment: a.details.encrypted ? undefined : a.details.comment ?? undefined
    }))
}

export function fromJettonTransfers(r: ToncenterJettonTransfers): Transfer[] {
  return r.jetton_transfers
    .filter(t => !t.transaction_aborted && t.source && t.destination)
    .map(t => ({
      id: t.transaction_hash,
      asset: 'usdt' as const,
      amount: BigInt(t.amount),
      from: t.source.toLowerCase(),
      to: t.destination.toLowerCase(),
      time: t.transaction_now,
      lt: BigInt(t.transaction_lt),
      tx: t.transaction_hash,
      comment: t.decoded_forward_payload?.comment || undefined
    }))
}

/** raw lowercase -> .ton / .t.me domain from a toncenter address_book. */
export function domainsFrom(book: AddressBook | undefined): [string, string][] {
  return Object.entries(book ?? {}).flatMap(([raw, v]) => (v?.domain ? [[raw.toLowerCase(), v.domain] as [string, string]] : []))
}

export interface WhaleFilter {
  /** Minimum amounts in base units; null hides that asset. */
  minCoin: bigint | null
  minUsdt: bigint | null
  /** Show transfers where either side is on the masterchain (elector, validators, system). */
  includeMasterchain: boolean
}

export function isWhale(t: Transfer, f: WhaleFilter): boolean {
  const min = t.asset === 'coin' ? f.minCoin : f.minUsdt
  if (min === null || t.amount < min) return false
  return f.includeMasterchain || !(t.from.startsWith('-1:') || t.to.startsWith('-1:'))
}

/** Newest first, duplicates dropped, capped at `max`. */
export function mergeFeed(current: Transfer[], incoming: Transfer[], max = 300): Transfer[] {
  const seen = new Set<string>()
  return [...incoming, ...current]
    .filter(t => (seen.has(`${t.asset}:${t.id}`) ? false : (seen.add(`${t.asset}:${t.id}`), true)))
    .sort((a, b) => b.time - a.time || (b.lt > a.lt ? 1 : b.lt < a.lt ? -1 : 0))
    .slice(0, max)
}

/** Highest logical time in a batch (the next poll asks for everything after it). */
export function maxLt(list: Transfer[], fallback: bigint): bigint {
  return list.reduce((m, t) => (t.lt > m ? t.lt : m), fallback)
}

export interface FlowSummary {
  count: number
  coin: bigint
  usdt: bigint
}

export function summarize(list: Transfer[]): FlowSummary {
  return list.reduce((s, t) => {
    s.count++
    if (t.asset === 'coin') s.coin += t.amount
    else s.usdt += t.amount
    return s
  }, { count: 0, coin: 0n, usdt: 0n } as FlowSummary)
}

/** Known entity (ton-assets) first, then the account's .ton domain. */
export function labelOf(raw: string, known: Map<string, string>, domains: Map<string, string>): string | undefined {
  return known.get(raw) ?? domains.get(raw)
}
