// Holders snapshot: aggregate toncenter v3 jetton wallets / NFT items into one row per owner. Pure TS.
import type { CsvRow } from '~/utils/csv'
import { formatAmount } from '~/utils/units'

export const PAGE = 1000

export interface AddressBookEntry {
  user_friendly: string
  domain?: string | null
  interfaces?: string[]
}
export type AddressBook = Record<string, AddressBookEntry>

/** toncenter v3 /jetton/wallets item. */
export interface JettonWalletItem {
  address: string
  balance: string
  owner: string
  jetton: string
}

/** toncenter v3 /nft/items item (with include_on_sale=true). */
export interface NftItem {
  address: string
  index: string
  owner_address: string | null
  /** Seller when the item sits in a sale contract (toncenter resolves Getgems etc.). */
  real_owner?: string | null
  on_sale?: boolean
}

export type OwnerKind = 'wallet' | 'contract' | 'unknown'

export interface HolderRow {
  rank: number
  /** Raw 0:… lowercase. */
  owner: string
  friendly?: string
  domain?: string
  kind: OwnerKind
  /** Interface names toncenter detected (e.g. wallet_v5r1, dedust_pool). */
  interfaces: string[]
  /** Jetton base units, or NFT count. */
  amount: bigint
  /** NFT only: item indexes and how many are listed for sale. */
  items?: string[]
  onSale?: number
}

export function ownerKind(interfaces: string[] | undefined): OwnerKind {
  if (!interfaces?.length) return 'unknown'
  return interfaces.some(i => i.startsWith('wallet')) ? 'wallet' : 'contract'
}

/** The all-zero address holds burned items/tokens: nobody owns them, and an airdrop sent there is lost. */
const BURN = `0:${'0'.repeat(64)}`

function bookEntry(book: AddressBook, raw: string): AddressBookEntry | undefined {
  return book[raw] ?? book[raw.toUpperCase()] ?? book[raw.toLowerCase()]
}

function finish(rows: Omit<HolderRow, 'rank'>[]): HolderRow[] {
  return rows
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.owner.localeCompare(b.owner)))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/** One row per owner (a wallet has one jetton wallet per jetton, but sum just in case). Zero balances dropped. */
export function jettonHolders(wallets: JettonWalletItem[], book: AddressBook): HolderRow[] {
  const by = new Map<string, Omit<HolderRow, 'rank'>>()
  for (const w of wallets) {
    const amount = BigInt(w.balance)
    if (amount <= 0n || !w.owner) continue
    const owner = w.owner.toLowerCase()
    if (owner === BURN) continue
    const row = by.get(owner)
    if (row) row.amount += amount
    else {
      const e = bookEntry(book, w.owner)
      by.set(owner, { owner, friendly: e?.user_friendly, domain: e?.domain ?? undefined, kind: ownerKind(e?.interfaces), interfaces: e?.interfaces ?? [], amount })
    }
  }
  return finish([...by.values()])
}

/** Groups items by their real owner, so items listed on a marketplace count for the seller. */
export function nftOwners(items: NftItem[], book: AddressBook): HolderRow[] {
  const by = new Map<string, Omit<HolderRow, 'rank'>>()
  for (const it of items) {
    const ownerRaw = it.real_owner || it.owner_address
    if (!ownerRaw) continue
    const owner = ownerRaw.toLowerCase()
    if (owner === BURN) continue
    let row = by.get(owner)
    if (!row) {
      const e = bookEntry(book, ownerRaw)
      row = { owner, friendly: e?.user_friendly, domain: e?.domain ?? undefined, kind: ownerKind(e?.interfaces), interfaces: e?.interfaces ?? [], amount: 0n, items: [], onSale: 0 }
      by.set(owner, row)
    }
    row.amount += 1n
    row.items!.push(it.index)
    if (it.on_sale || (it.real_owner && it.owner_address && it.real_owner.toLowerCase() !== it.owner_address.toLowerCase())) row.onSale! += 1
  }
  for (const r of by.values()) r.items!.sort((a, b) => (BigInt(a) > BigInt(b) ? 1 : -1))
  return finish([...by.values()])
}

export interface Filters {
  /** Minimum amount in base units (jetton) or items (NFT). */
  min: bigint
  excludeContracts: boolean
  /** Raw addresses to leave out (e.g. team wallets, the deployer). */
  exclude: Set<string>
}

export function applyFilters(rows: HolderRow[], f: Filters): HolderRow[] {
  return rows
    .filter(r => r.amount >= f.min && !(f.excludeContracts && r.kind === 'contract') && !f.exclude.has(r.owner))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/** Share of `total` in percent with 4 decimals, exact (bigint). "" when total is 0. */
export function share(amount: bigint, total: bigint): string {
  if (total <= 0n) return ''
  const bp = (amount * 1_000_000n) / total // 1e-4 %
  return `${bp / 10_000n}.${(bp % 10_000n).toString().padStart(4, '0')}`
}

export interface Summary {
  holders: number
  sum: bigint
  contracts: number
}

export function summarize(rows: HolderRow[]): Summary {
  return { holders: rows.length, sum: rows.reduce((s, r) => s + r.amount, 0n), contracts: rows.filter(r => r.kind === 'contract').length }
}

export function csvRows(rows: HolderRow[], o: { decimals?: number, total: bigint, nft: boolean, friendly: (raw: string) => string }): CsvRow[] {
  return rows.map(r => ({
    rank: r.rank,
    owner: o.friendly(r.owner),
    owner_raw: r.owner,
    ...(o.nft
      ? { items: r.amount, item_indexes: r.items?.join(' '), listed_for_sale: r.onSale ?? 0 }
      : { balance: formatAmount(r.amount, o.decimals ?? 9, { group: false }), balance_units: r.amount }),
    percent: share(r.amount, o.total),
    owner_type: r.kind,
    interfaces: r.interfaces.join(' '),
    domain: r.domain ?? ''
  }))
}

/** "address,amount" lines (amount in whole tokens / items), the input format of bulk senders. */
export function airdropList(rows: HolderRow[], decimals: number | null, friendly: (raw: string) => string): string {
  return rows.map(r => `${friendly(r.owner)},${decimals === null ? r.amount : formatAmount(r.amount, decimals, { group: false })}`).join('\n')
}
