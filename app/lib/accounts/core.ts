// Shared, pure helpers for the "accounts" tools (overview, portfolio, bulk checker, watchlist, search).
// Imports @ton/core, so use from Tool.vue / logic.ts only (client + vitest).
import { Address } from '@ton/core'
import { detectWalletVersion } from '~/utils/ton/wallets'

// ---------- input ----------

/** .ton and .t.me names that tonapi can resolve (foundation.ton, sub.foundation.ton, alice.t.me). */
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+(?:ton|t\.me)$/i
const RAW_RE = /^-?\d{1,3}:[0-9a-f]{64}$/i
const FRIENDLY_RE = /^[A-Za-z0-9_+/-]{48}$/

export function isDomainName(s: string): boolean {
  return DOMAIN_RE.test(s.trim())
}

/** Lowercase raw form "0:abc…", the key used everywhere in these tools. Throws on invalid input. */
export function toRaw(address: string | Address): string {
  const a = typeof address === 'string' ? Address.parse(address.trim()) : address
  return a.toRawString().toLowerCase()
}

/** Friendly form a person should use: wallets non-bounceable (UQ…), contracts bounceable (EQ…). */
export function friendly(raw: string, { wallet = true, testnet = false } = {}): string {
  return Address.parse(raw).toString({ bounceable: !wallet, testOnly: testnet, urlSafe: true })
}

export interface ParsedRow {
  /** 1-based line in the pasted text. */
  line: number
  /** The address or name exactly as written. */
  input: string
  /** Everything else on the line (CSV label/notes), trimmed. */
  label: string
  /** Lowercase raw address. Missing for names (resolve later) and invalid rows. */
  raw?: string
  /** A .ton / .t.me name to resolve. */
  domain?: string
  error?: string
  /** Line number of the first occurrence, when this row repeats an earlier address/name. */
  duplicateOf?: number
}

/**
 * Parses pasted text or a CSV/TSV: one account per line, the first field that looks like an address
 * (raw or friendly) or a .ton/.t.me name is used, the rest of the line becomes the label.
 * A first line without any address (a CSV header) is skipped silently.
 */
export function parseAccountList(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const seen = new Map<string, number>()
  const lines = text.split(/\r?\n/)
  lines.forEach((rawLine, i) => {
    const lineText = rawLine.trim()
    if (!lineText || lineText.startsWith('#')) return
    const cells = lineText.split(/[,;\t]|\s+/).map(c => c.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    const idx = cells.findIndex(c => isDomainName(c) || RAW_RE.test(c) || FRIENDLY_RE.test(c))
    if (idx === -1) {
      if (!rows.length && i === lines.findIndex(l => l.trim())) return // header row
      rows.push({ line: i + 1, input: lineText, label: '', error: 'No address on this line' })
      return
    }
    const input = cells[idx]!
    const label = cells.filter((_, j) => j !== idx).join(' ')
    const row: ParsedRow = { line: i + 1, input, label }
    if (isDomainName(input)) {
      row.domain = input.toLowerCase()
    }
    else {
      try {
        row.raw = toRaw(input)
      }
      catch {
        row.error = 'Not a valid TON address (check for a typo)'
      }
    }
    const key = row.raw ?? row.domain
    if (key) {
      const first = seen.get(key)
      if (first) row.duplicateOf = first
      else seen.set(key, row.line)
    }
    rows.push(row)
  })
  return rows
}

// ---------- account state (toncenter v3 walletStates + tonapi accounts/_bulk) ----------

export type AccountStatus = 'active' | 'uninit' | 'frozen' | 'nonexist'

/** toncenter v3 /walletStates item (works for any account; non-wallets have is_wallet=false). */
export interface ToncenterWalletState {
  address: string
  is_wallet: boolean
  wallet_type?: string
  seqno?: number
  wallet_id?: number
  balance: string
  status: AccountStatus
  code_hash?: string
  last_transaction_hash?: string
  last_transaction_lt?: string
  suspended?: boolean
}
export interface ToncenterWalletStates {
  wallets: ToncenterWalletState[]
  address_book?: Record<string, { user_friendly: string, domain: string | null, interfaces?: string[] }>
}

/** tonapi /v2/accounts/{id} and /accounts/_bulk item. `balance` is a JSON number: never use it for exact math. */
export interface TonapiAccount {
  address: string
  balance: number
  last_activity: number
  status: AccountStatus
  interfaces?: string[]
  name?: string
  icon?: string
  is_scam?: boolean
  memo_required?: boolean
  is_wallet?: boolean
  is_suspended?: boolean
}

export interface AccountState {
  raw: string
  status: AccountStatus
  /** Exact nanoGRAM balance from toncenter (tonapi numbers lose precision above 2^53). */
  balance: bigint
  isWallet: boolean
  /** Human contract type: "Wallet v3R2", "Jetton master", … */
  kind: string
  seqno?: number
  walletId?: number
  codeHash?: string
  lastTxLt?: string
  lastTxHash?: string
  interfaces: string[]
  domain?: string | null
  suspended?: boolean
  // From tonapi (optional: missing when tonapi failed)
  name?: string
  isScam?: boolean
  memoRequired?: boolean
  /** Unix seconds of the last transaction; 0/undefined when unknown. */
  lastActivity?: number
}

const INTERFACE_LABELS: Record<string, string> = {
  jetton_master: 'Jetton master',
  jetton_wallet: 'Jetton wallet',
  jetton_wallet_v1: 'Jetton wallet',
  jetton_wallet_v2: 'Jetton wallet',
  nft_item: 'NFT item',
  nft_collection: 'NFT collection',
  nft_sale: 'NFT sale',
  dns_item: 'DNS item',
  elector: 'Elector',
  config: 'Config contract',
  locker: 'Locker',
  multisig_v2: 'Multisig v2',
  vesting: 'Vesting wallet',
  nominator_pool: 'Nominator pool',
  whales_pool: 'Whales pool',
  tf_nominator: 'Nominator pool',
  single_nominator: 'Single nominator'
}

/** "wallet_v3r2" -> "Wallet v3r2", "jetton_master" -> "Jetton master". */
function prettyInterface(i: string): string {
  if (INTERFACE_LABELS[i]) return INTERFACE_LABELS[i]
  const s = i.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Best human label for what an account is: wallet version by code hash, then indexer interfaces. */
export function accountKind(s: { status: AccountStatus, codeHash?: string, walletType?: string, interfaces?: string[], isWallet?: boolean }): string {
  if (s.status === 'nonexist') return 'Never used'
  if (s.status === 'uninit') return 'Not deployed yet'
  if (s.status === 'frozen') return 'Frozen'
  const w = s.codeHash ? detectWalletVersion(s.codeHash) : null
  if (w) return w.label
  if (s.walletType) return s.walletType.replace(/^wallet /, 'Wallet ').replace(/ (r\d)$/, '$1')
  const i = s.interfaces?.find(x => !x.startsWith('wallet')) ?? s.interfaces?.[0]
  return i ? prettyInterface(i) : 'Smart contract'
}

/**
 * Merges both APIs into one state per requested address. Addresses toncenter does not return never
 * existed on-chain (status nonexist, balance 0).
 */
export function mergeStates(raws: string[], tc: ToncenterWalletStates | null, ta: TonapiAccount[] | null): AccountState[] {
  const tcBy = new Map((tc?.wallets ?? []).map(w => [w.address.toLowerCase(), w]))
  const book = new Map(Object.entries(tc?.address_book ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  const taBy = new Map((ta ?? []).map(a => [a.address.toLowerCase(), a]))
  return raws.map((raw) => {
    const w = tcBy.get(raw)
    const a = taBy.get(raw)
    const interfaces = book.get(raw)?.interfaces ?? a?.interfaces ?? []
    const status: AccountStatus = w?.status ?? (tc ? 'nonexist' : a?.status ?? 'nonexist')
    const isWallet = w ? w.is_wallet : !!a?.is_wallet
    return {
      raw,
      status,
      balance: w ? BigInt(w.balance) : tc ? 0n : BigInt(Math.round(a?.balance ?? 0)),
      isWallet,
      kind: accountKind({ status, codeHash: w?.code_hash, walletType: w?.wallet_type, interfaces, isWallet }),
      seqno: w?.seqno,
      walletId: w?.wallet_id,
      codeHash: w?.code_hash,
      lastTxLt: w?.last_transaction_lt,
      lastTxHash: w?.last_transaction_hash,
      interfaces,
      domain: book.get(raw)?.domain,
      suspended: w?.suspended ?? a?.is_suspended,
      name: a?.name,
      isScam: a?.is_scam,
      memoRequired: a?.memo_required,
      lastActivity: a?.last_activity || undefined
    }
  })
}

// ---------- prices ----------

export interface Rate {
  price: number
  /** Percent change, e.g. -2.51 for "−2.51%". */
  diff24h?: number
  diff7d?: number
  diff30d?: number
}

/** tonapi diffs are strings with a Unicode minus: "−2.51%", "+1.20%", "0.00%". */
export function parseDiff(s: string | undefined): number | undefined {
  if (!s) return undefined
  const n = Number(s.replace('−', '-').replace('%', '').trim())
  return Number.isFinite(n) ? n : undefined
}

export interface TonapiPrice {
  prices?: Record<string, number>
  diff_24h?: Record<string, string>
  diff_7d?: Record<string, string>
  diff_30d?: Record<string, string>
}

/** One currency out of a tonapi price object (from /rates or a jetton balance). Currency is upper case. */
export function pickRate(p: TonapiPrice | undefined, currency: string): Rate | undefined {
  const price = p?.prices?.[currency]
  if (price === undefined) return undefined
  return { price, diff24h: parseDiff(p?.diff_24h?.[currency]), diff7d: parseDiff(p?.diff_7d?.[currency]), diff30d: parseDiff(p?.diff_30d?.[currency]) }
}

/** Fiat value of an exact token amount. Float is fine here: fiat is a display estimate. */
export function fiatValue(units: bigint, decimals: number, price: number): number {
  const base = 10n ** BigInt(decimals)
  return (Number(units / base) + Number(units % base) / Number(base)) * price
}

/** Fiat currencies tonapi /rates supports (checked 2026-10-22). */
export const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'RUB', 'UAH', 'INR', 'CNY', 'JPY', 'KRW', 'AED', 'BRL', 'IDR', 'NGN', 'VND'] as const
export type FiatCurrency = typeof FIAT_CURRENCIES[number]

/** "$1,234.56"; below 1 keeps 3 significant digits so tiny token prices don't show as "$0.00". */
export function formatFiat(value: number, currency: string): string {
  const small = value !== 0 && Math.abs(value) < 1
  return new Intl.NumberFormat('en-US', small
    ? { style: 'currency', currency, maximumSignificantDigits: 3 }
    : { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function formatPercent(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ---------- time ----------

/** "just now", "5 min ago", "3 h ago", "12 days ago", "2 years ago". */
export function timeAgo(unix: number | undefined, nowMs = Date.now()): string {
  if (!unix) return '—'
  const s = Math.max(0, Math.round(nowMs / 1000 - unix))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  if (d < 60) return `${d} day${d === 1 ? '' : 's'} ago`
  if (d < 730) return `${Math.floor(d / 30)} months ago`
  return `${Math.floor(d / 365)} years ago`
}

/** "2026-10-22 14:05 UTC". */
export function formatUtc(unix: number | undefined): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export const STATUS_INFO: Record<AccountStatus, { label: string, color: 'success' | 'neutral' | 'warning' | 'error', hint: string }> = {
  active: { label: 'Active', color: 'success', hint: 'Deployed contract that can send and receive.' },
  uninit: { label: 'Not deployed', color: 'neutral', hint: 'Has received funds but no contract code yet. A wallet deploys itself on its first outgoing transfer.' },
  frozen: { label: 'Frozen', color: 'error', hint: 'Storage fees ran into debt, so the contract was frozen. It can be unfrozen by sending enough coins.' },
  nonexist: { label: 'Never used', color: 'neutral', hint: 'Nothing on-chain at this address yet. That is normal for a fresh wallet.' }
}

// ---------- jettons (tonapi /accounts/{id}/jettons?currencies=…) ----------

export interface TonapiJettonBalance {
  balance: string
  price?: TonapiPrice
  wallet_address?: { address: string }
  jetton: {
    address: string
    name: string
    symbol: string
    decimals: number
    image?: string
    /** 'whitelist' (checked by tonapi), 'none', 'blacklist' (scam). */
    verification?: string
  }
}

export interface Holding {
  /** Jetton master, lowercase raw. */
  master: string
  symbol: string
  name: string
  image?: string
  decimals: number
  units: bigint
  verification: string
  rate?: Rate
  /** Fiat value; undefined when tonapi has no price (or the price is 0). */
  value?: number
}

export function toHolding(b: TonapiJettonBalance, currency: string): Holding {
  const rate = pickRate(b.price, currency.toUpperCase())
  const units = BigInt(b.balance)
  const decimals = b.jetton.decimals ?? 9
  return {
    master: b.jetton.address.toLowerCase(),
    symbol: b.jetton.symbol || '?',
    name: b.jetton.name || b.jetton.symbol || 'Unknown jetton',
    image: b.jetton.image,
    decimals,
    units,
    verification: b.jetton.verification ?? 'none',
    rate: rate?.price ? rate : undefined,
    value: rate?.price ? fiatValue(units, decimals, rate.price) : undefined
  }
}
