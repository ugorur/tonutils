// Shared, pure helpers for the wallet-action tools (send GRAM, send jettons, transfer NFTs, burn jettons, sign).
// Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { Address } from '@ton/core'
import { COIN_SYMBOL } from '~/utils/currency'
import { jettonDecimals } from '~/utils/ton/jetton'

// ---------------------------------------------------------------- recipient input

/** .ton / .t.me names tonapi resolves (foundation.ton, sub.foundation.ton, alice.t.me). */
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+(?:ton|t\.me)$/i

export type RecipientInput =
  | { kind: 'empty' }
  | { kind: 'invalid', error: string }
  | { kind: 'domain', domain: string }
  /** `bounceable` is the flag the user typed (EQ/kQ true, UQ/0Q false), null for raw 0:… */
  | { kind: 'address', address: Address, bounceable: boolean | null, testOnly: boolean | null }

export function parseRecipient(input: string): RecipientInput {
  const s = input.trim()
  if (!s) return { kind: 'empty' }
  if (DOMAIN_RE.test(s)) return { kind: 'domain', domain: s.toLowerCase() }
  try {
    if (Address.isFriendly(s)) {
      const f = Address.parseFriendly(s)
      return { kind: 'address', address: f.address, bounceable: f.isBounceable, testOnly: f.isTestOnly }
    }
    if (Address.isRaw(s)) return { kind: 'address', address: Address.parseRaw(s), bounceable: null, testOnly: null }
  }
  catch { /* falls through */ }
  return { kind: 'invalid', error: 'Not a TON address or domain. Use EQ…/UQ…, raw 0:…, or a name like foundation.ton or alice.t.me.' }
}

// ---------------------------------------------------------------- account info (tonapi /v2/accounts/{id})

export type AccountStatus = 'active' | 'uninit' | 'frozen' | 'nonexist'

export interface TonapiAccount {
  address: string
  balance?: number
  status: AccountStatus | string
  name?: string
  is_scam?: boolean
  memo_required?: boolean
  is_wallet?: boolean
  interfaces?: string[]
}

const isDeployed = (status: string) => status === 'active' || status === 'frozen'

/**
 * Bounce flag for a plain GRAM transfer. Uninitialized accounts get non-bounceable (otherwise the coins
 * bounce straight back); deployed ones keep what the user typed, defaulting to bounceable (safer for contracts).
 */
export function chooseBounce(typed: boolean | null, status: string): { bounceable: boolean, autofixed: boolean } {
  if (!isDeployed(status)) return { bounceable: false, autofixed: typed === true }
  return { bounceable: typed ?? true, autofixed: false }
}

export type Purpose = 'coin' | 'jetton' | 'nft'

export interface Note {
  level: 'error' | 'warning' | 'info'
  text: string
}

export interface NoteContext {
  purpose: Purpose
  /** Comment the user entered (memo). */
  comment: string
  testnet: boolean
  /** Test-only flag of the typed address (null when raw or a domain). */
  typedTestOnly: boolean | null
  /** Connected/owner address, to flag self-transfers. */
  self?: Address | null
  autofixed?: boolean
}

const ZERO = new Address(0, Buffer.alloc(32))

/** Checks a person should see before sending to this account. Errors block the send. */
export function recipientNotes(address: Address, acc: TonapiAccount | null, ctx: NoteContext): Note[] {
  const out: Note[] = []
  const what = ctx.purpose === 'coin' ? COIN_SYMBOL : ctx.purpose === 'jetton' ? 'tokens' : 'the NFT'
  if (address.equals(ZERO) || address.equals(new Address(-1, Buffer.alloc(32)))) {
    out.push({ level: 'error', text: `This is the zero address. Nobody holds its key, so ${what} sent there are gone forever.` })
  }
  if (ctx.typedTestOnly !== null && ctx.typedTestOnly !== ctx.testnet) {
    out.push({ level: 'warning', text: ctx.testnet ? 'This is a mainnet-form address but the site is on testnet.' : 'This is a testnet-only address (0Q…/kQ…) but the site is on mainnet. Check you copied the right one.' })
  }
  if (ctx.self && address.equals(ctx.self)) out.push({ level: 'info', text: 'This is your own address.' })
  if (!acc) return out
  const ifaces = acc.interfaces ?? []
  if (acc.is_scam) out.push({ level: 'warning', text: 'tonapi flags this account as a scam. Do not send unless you are certain.' })
  if (acc.memo_required && !ctx.comment.trim()) {
    out.push({ level: 'warning', text: `${acc.name ? `${acc.name} requires` : 'This address requires'} a comment (memo). Exchanges use it to credit your account: without it the deposit can be lost. Copy the memo from the exchange's deposit page.` })
  }
  if (ctx.purpose !== 'coin') {
    if (ifaces.some(i => i.startsWith('jetton_wallet'))) out.push({ level: 'error', text: 'This is a jetton wallet contract, not a person\'s address. Ask the recipient for their main wallet address (the one starting with UQ… or EQ… shown in their wallet app).' })
    else if (ifaces.includes('jetton_master')) out.push({ level: 'error', text: 'This is a token contract (jetton master), not a wallet. Tokens sent here are usually lost.' })
    else if (ifaces.includes('nft_item') || ifaces.includes('nft_collection')) out.push({ level: 'error', text: 'This is an NFT contract, not a wallet.' })
    else if (acc.status === 'active' && acc.is_wallet === false) out.push({ level: 'warning', text: `This is a smart contract, not a wallet${ifaces.length ? ` (${ifaces.join(', ')})` : ''}. Only continue if it is meant to receive ${what}.` })
  }
  else if (acc.status === 'active' && acc.is_wallet === false && !acc.name) {
    out.push({ level: 'info', text: `This is a smart contract, not a wallet${ifaces.length ? ` (${ifaces.join(', ')})` : ''}. It is sent bounceable, so the ${COIN_SYMBOL} comes back if the contract rejects it.` })
  }
  if (acc.status === 'frozen') out.push({ level: 'warning', text: `This account is frozen (it ran out of ${COIN_SYMBOL} for storage). Incoming funds may be used to pay its debt.` })
  if (!isDeployed(acc.status)) {
    out.push({
      level: 'info',
      text: ctx.purpose === 'coin'
        ? `This address has never been used (${acc.status}). That is normal for a new wallet.${ctx.autofixed ? ' It was typed in bounceable form (EQ…), which would send the coins straight back, so it is sent non-bounceable (UQ…) instead.' : ''}`
        : 'This wallet has never been used yet. It can still receive and will see the tokens once it is activated.'
    })
  }
  return out
}

/** Checkbox text required before sending to a memo-required account (exchange) without a comment. */
export const NO_MEMO_CONFIRM = 'I am sending without a memo and understand the exchange may not credit this deposit.'

/** What RecipientInput emits once the recipient is resolved and checked. */
export interface Recipient {
  address: Address
  /** Friendly form to put in the TonConnect message (bounce flag already chosen). */
  destination: string
  bounceable: boolean
  domain: string | null
  account: TonapiAccount | null
  notes: Note[]
  /** True when a note has level 'error'. */
  blocked: boolean
}

// ---------------------------------------------------------------- jettons (tonapi /v2/accounts/{id}/jettons)

export interface TonapiJettonBalance {
  balance: string
  wallet_address: { address: string }
  jetton: { address: string, name?: string, symbol?: string, decimals?: number | string, image?: string, verification?: string }
  extensions?: string[]
  lock?: { amount: string, till: number }
}

export interface OwnedJetton {
  /** Raw, lowercase. */
  master: string
  /** The owner's jetton wallet (where transfer/burn messages go). Raw, lowercase. */
  wallet: string
  name: string
  symbol: string
  decimals: number
  image?: string
  /** tonapi verification: whitelist | none | blacklist (spam/scam). */
  verification: string
  balance: bigint
  /** Mintless/compressed jetton that must be claimed first (needs a custom payload proof). */
  needsClaim: boolean
  locked: bigint
}

export function toOwnedJetton(b: TonapiJettonBalance): OwnedJetton {
  return {
    master: b.jetton.address.toLowerCase(),
    wallet: b.wallet_address.address.toLowerCase(),
    name: b.jetton.name || 'Unnamed token',
    symbol: b.jetton.symbol || '?',
    decimals: jettonDecimals({ decimals: b.jetton.decimals }),
    image: b.jetton.image,
    verification: b.jetton.verification ?? 'none',
    balance: BigInt(b.balance),
    needsClaim: !!b.extensions?.includes('custom_payload'),
    locked: b.lock ? BigInt(b.lock.amount) : 0n
  }
}

const VERIFY_ORDER: Record<string, number> = { whitelist: 0, none: 1, graylist: 2, blacklist: 3 }

/** Verified first, spam last; then non-zero balances first. */
export function sortJettons(list: OwnedJetton[]): OwnedJetton[] {
  return [...list].sort((a, b) =>
    (VERIFY_ORDER[a.verification] ?? 1) - (VERIFY_ORDER[b.verification] ?? 1)
    || Number(b.balance > 0n) - Number(a.balance > 0n)
    || a.symbol.localeCompare(b.symbol))
}

type TonapiGet = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

/** The owner's jettons from tonapi, sorted (pass useTonapi().get). */
export async function fetchJettons(get: TonapiGet, owner: Address): Promise<OwnedJetton[]> {
  const r = await get<{ balances: TonapiJettonBalance[] }>(`accounts/${owner.toRawString()}/jettons`, { supported_extensions: 'custom_payload' })
  return sortJettons(r.balances.map(toOwnedJetton))
}

// ---------------------------------------------------------------- transactions

/** GRAM attached to a jetton transfer/burn or NFT transfer for gas; the unused part returns as excesses. */
export const TOKEN_GAS = 50_000_000n // 0.05 GRAM

/** TonConnect's minimum: wallets that advertise nothing accept 4 messages per request. */
export const DEFAULT_MAX_MESSAGES = 4

/** maxMessages from the wallet's SendTransaction feature (TonConnect device.features). */
export function maxMessages(features: readonly unknown[] | undefined): number {
  const f = features?.find((x): x is { name: string, maxMessages?: number } => typeof x === 'object' && x !== null && (x as { name?: string }).name === 'SendTransaction')
  return f?.maxMessages && f.maxMessages > 0 ? f.maxMessages : DEFAULT_MAX_MESSAGES
}

/** Signature types the wallet's SignData feature accepts ([] when it does not support signData). */
export function signDataTypes(features: readonly unknown[] | undefined): string[] {
  const f = features?.find((x): x is { name: string, types?: string[] } => typeof x === 'object' && x !== null && (x as { name?: string }).name === 'SignData')
  return f?.types ?? []
}

export function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Unique-enough 64-bit query id (ms timestamp), the same scheme several wallets use. */
export function newQueryId(now = Date.now()): bigint {
  return BigInt(now)
}

/** Friendly form for display: wallets non-bounceable (UQ…), contracts bounceable (EQ…). */
export function friendly(address: Address | string, { bounceable = false, testnet = false } = {}): string {
  const a = typeof address === 'string' ? Address.parse(address) : address
  return a.toString({ bounceable, testOnly: testnet, urlSafe: true })
}
