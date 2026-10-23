// Payment requests: build and parse ton:// transfer links, wallet universal links and the TonUtils
// checkout/invoice URLs (which reuse the same query names). Imports @ton/core: Tool.vue / logic.ts only.
//
// Formats (docs.ton.org/ecosystem/wallet-apps/deep-links, docs.tonconsole.com/tonkeeper/deep-linking):
//   ton://transfer/<ADDRESS>?amount=<nano>&text=<urlenc>&exp=<unix>
//   ton://transfer/<ADDRESS>?jetton=<MASTER>&amount=<base units>&text=<urlenc>
//   …&bin=<base64url BOC> (body; amount required), …&init=<base64url StateInit>
//   https://app.tonkeeper.com/transfer/… (Keeper, formerly Tonkeeper; also app.keeperwallet.com, keeper://, tonkeeper://)
//   https://tonhub.com/transfer/<ADDRESS>?amount=&text= (GRAM only)
import { Address, Cell } from '@ton/core'
import { formatCoin } from '~/utils/currency'
import { formatJettonAmount, KNOWN_JETTONS } from '~/utils/ton/jetton'

export interface PaymentRequest {
  /** Recipient, user-friendly (keeps the bounce/test flags it was given with). */
  to: string
  /** Base units: nanoGRAM, or jetton units when `jetton` is set. */
  amount?: bigint
  /** Jetton master address (user-friendly). */
  jetton?: string
  /** Text comment. */
  text?: string
  /** Message body, base64url BOC (replaces `text`). */
  bin?: string
  /** StateInit to deploy, base64url BOC. */
  init?: string
  /** Expiry, unix seconds. */
  exp?: number
}

export type LinkKind = 'ton' | 'keeper' | 'tonhub'

export const SITE_ORIGIN = 'https://tonutils.io'
export const HOSTED_PATH = '/tools/hosted-pay-page'
export const INVOICE_PATH = '/tools/invoice-checker'

const PREFIX: Record<LinkKind, string> = {
  ton: 'ton://transfer/',
  keeper: 'https://app.tonkeeper.com/transfer/',
  tonhub: 'https://tonhub.com/transfer/'
}

export const LINK_LABEL: Record<LinkKind, string> = {
  ton: 'ton:// link (any TON wallet)',
  keeper: 'Keeper (Tonkeeper) universal link',
  tonhub: 'Tonhub universal link'
}

/** Query string in the documented parameter order; values percent-encoded (spaces as %20, never '+'). */
function query(pairs: [string, string | number | bigint | undefined][]): string {
  const s = pairs
    .filter((p): p is [string, string | number | bigint] => p[1] !== undefined && p[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  return s ? `?${s}` : ''
}

const linkPairs = (r: PaymentRequest): [string, string | number | bigint | undefined][] => [
  ['jetton', r.jetton],
  ['amount', r.amount],
  ['text', r.bin ? undefined : r.text],
  ['bin', r.bin],
  ['init', r.init],
  ['exp', r.exp]
]

/** Which link formats can carry this request (Tonhub documents GRAM transfers only). */
export function supportedKinds(r: PaymentRequest): LinkKind[] {
  return r.jetton || r.bin || r.init ? ['ton', 'keeper'] : ['ton', 'keeper', 'tonhub']
}

export function buildLink(r: PaymentRequest, kind: LinkKind = 'ton'): string {
  return PREFIX[kind] + r.to + query(linkPairs(r))
}

export interface ShareExtras {
  /** Network the request is meant for; testnet adds `testnet=1`. */
  testnet?: boolean
  /** Decimals of a jetton not in KNOWN_JETTONS (lets the receiving tool show human amounts offline). */
  decimals?: number
  /** Free text shown on the checkout page ("Invoice #42 for logo design"). */
  label?: string
  /** Invoice creation time (unix): payments before it are ignored. */
  since?: number
}

/** Query used by the TonUtils payment tools (same names as ton:// links, plus `to`). */
export function requestQuery(r: PaymentRequest, x: ShareExtras = {}): string {
  return query([
    ['to', r.to],
    ...linkPairs(r),
    ['dec', r.jetton && !knownJetton(r.jetton) ? x.decimals : undefined],
    ['label', x.label],
    ['since', x.since],
    ['testnet', x.testnet ? 1 : undefined]
  ])
}

export const hostedUrl = (r: PaymentRequest, x: ShareExtras = {}, origin = SITE_ORIGIN) => origin + HOSTED_PATH + requestQuery(r, x)
export const invoiceUrl = (r: PaymentRequest, x: ShareExtras = {}, origin = SITE_ORIGIN) => origin + INVOICE_PATH + requestQuery(r, x)

// ---------------------------------------------------------------- assets

export interface AssetInfo {
  symbol: string
  decimals: number
  /** Jetton master, user-friendly; undefined for GRAM. */
  master?: string
  known: boolean
}

export function knownJetton(master: string) {
  try {
    const a = Address.parse(master)
    return KNOWN_JETTONS.find(j => Address.parse(j.master).equals(a))
  }
  catch {
    return undefined
  }
}

/** Formats an amount of the request's asset ("5 GRAM", "12.5 USD₮"). */
export function formatAsset(amount: bigint, asset: Pick<AssetInfo, 'symbol' | 'decimals' | 'master'>): string {
  return asset.master ? formatJettonAmount(amount, asset.decimals, { symbol: asset.symbol }) : formatCoin(amount)
}

// ---------------------------------------------------------------- validation helpers

export type AddressCheck = { ok: true, address: Address, friendly: string, bounceable: boolean, testOnly: boolean } | { ok: false, error: string }

/**
 * Normalizes a recipient for a link. Friendly input keeps its flags (url-safe form). Raw 0:… becomes
 * non-bounceable (UQ…, right for wallets, including brand-new ones) in the given network's form.
 */
export function checkAddress(input: string, testnet = false): AddressCheck {
  const s = input.trim()
  if (!s) return { ok: false, error: 'Enter the address that receives the payment.' }
  try {
    if (Address.isFriendly(s)) {
      const f = Address.parseFriendly(s)
      return { ok: true, address: f.address, bounceable: f.isBounceable, testOnly: f.isTestOnly, friendly: f.address.toString({ bounceable: f.isBounceable, testOnly: f.isTestOnly, urlSafe: true }) }
    }
    if (Address.isRaw(s)) {
      const a = Address.parseRaw(s)
      return { ok: true, address: a, bounceable: false, testOnly: testnet, friendly: a.toString({ bounceable: false, testOnly: testnet, urlSafe: true }) }
    }
  }
  catch { /* falls through */ }
  return { ok: false, error: 'Not a valid TON address. Use the UQ… / EQ… form from the wallet, or raw 0:….' }
}

const b64url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Validates a BOC given as base64/base64url/hex and returns it as base64url (link form). */
export function normalizeBoc(input: string): { ok: true, cell: Cell, b64url: string } | { ok: false, error: string } {
  const s = input.trim().replace(/\s+/g, '')
  try {
    const bytes = /^(0x)?[0-9a-f]+$/i.test(s) && s.length % 2 === 0
      ? Buffer.from(s.replace(/^0x/i, ''), 'hex')
      : Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const cell = Cell.fromBoc(bytes)[0]!
    return { ok: true, cell, b64url: b64url(cell.toBoc().toString('base64')) }
  }
  catch {
    return { ok: false, error: 'Not a valid BOC. Paste base64 (te6cc…) or hex (b5ee9c72…).' }
  }
}

// ---------------------------------------------------------------- parsing

export type LinkSource = 'ton' | 'keeper' | 'tonhub' | 'tonutils'

export interface ParsedLink {
  source: LinkSource
  request: PaymentRequest
  /** Parsed recipient. */
  address: Address
  bounceable: boolean
  testOnly: boolean
  /** From TonUtils URLs. */
  extras: ShareExtras
  /** Things a payer should know (ignored params, both text and bin, …). */
  warnings: string[]
  /** Every query parameter as given. */
  params: [string, string][]
}

export type ParseResult =
  | { ok: true, link: ParsedLink }
  | { ok: false, kind: 'empty' | 'address' | 'tonconnect' | 'invalid', error: string, address?: string }

const KNOWN_PARAMS = new Set(['amount', 'text', 'jetton', 'bin', 'init', 'exp'])
const TONUTILS_PARAMS = new Set(['to', 'dec', 'label', 'since', 'testnet'])

/** Splits a link into source, address path and raw query (no '+'-to-space mangling of base64). */
function splitLink(input: string): { source: LinkSource, path: string, query: string } | null {
  const s = input.trim()
  const m = /^(ton|keeper|tonkeeper|tonhub):\/\/transfer\/?([^?#]*)(?:\?([^#]*))?/i.exec(s)
    ?? /^https?:\/\/(?:www\.)?(app\.tonkeeper\.com|app\.keeperwallet\.com|tonhub\.com)\/transfer\/([^?#]*)(?:\?([^#]*))?/i.exec(s)
  if (m) {
    const host = m[1]!.toLowerCase()
    const source: LinkSource = host === 'ton' ? 'ton' : host.includes('tonhub') ? 'tonhub' : 'keeper'
    return { source, path: decodeURIComponent(m[2] ?? ''), query: m[3] ?? '' }
  }
  const t = /^(?:https?:\/\/[^/?#]+)?\/tools\/(?:hosted-pay-page|invoice-checker|payment-link-generator|pay-button-generator)\/?\?([^#]*)/i.exec(s)
  if (t) return { source: 'tonutils', path: '', query: t[1] ?? '' }
  return null
}

function decodeParam(v: string, key: string): string {
  try {
    // Text may come form-encoded ('+' for space); BOCs are base64 where '+' is data.
    return decodeURIComponent(key === 'text' || key === 'label' ? v.replace(/\+/g, ' ') : v)
  }
  catch {
    return v
  }
}

/** Parses any supported payment link. Never throws. */
export function parsePaymentLink(input: string): ParseResult {
  const s = input.trim()
  if (!s) return { ok: false, kind: 'empty', error: 'Paste a payment link or scan a QR code.' }
  if (/^tc:\/\//i.test(s) || /[?&]v=2&id=[0-9a-f]{64}/i.test(s)) {
    return { ok: false, kind: 'tonconnect', error: 'This is a TonConnect connection request, not a payment link. It asks a wallet to connect to a website; it contains no recipient or amount. Only open it if you started the connection yourself.' }
  }
  const parts = splitLink(s)
  if (!parts) {
    const a = checkAddress(s)
    if (a.ok) return { ok: false, kind: 'address', address: a.friendly, error: 'This is a plain address, not a payment link: it has no amount or comment.' }
    return { ok: false, kind: 'invalid', error: 'Not a payment link. Supported: ton://transfer/…, https://app.tonkeeper.com/transfer/…, https://tonhub.com/transfer/…, keeper:// and TonUtils checkout or invoice links.' }
  }

  const params: [string, string][] = parts.query
    ? parts.query.split('&').filter(Boolean).map((p) => {
        const i = p.indexOf('=')
        const k = decodeParam(i === -1 ? p : p.slice(0, i), 'key')
        return [k, i === -1 ? '' : decodeParam(p.slice(i + 1), k)]
      })
    : []
  const get = (k: string) => params.find(p => p[0] === k)?.[1]
  const warnings: string[] = []

  const to = parts.source === 'tonutils' ? get('to') ?? '' : parts.path
  const addr = checkAddress(to)
  if (!addr.ok) return { ok: false, kind: 'invalid', error: to ? `The recipient "${to}" is not a valid TON address.` : 'The link has no recipient address.' }

  const r: PaymentRequest = { to: addr.friendly }
  const amount = get('amount')
  if (amount !== undefined && amount !== '') {
    if (!/^\d+$/.test(amount)) return { ok: false, kind: 'invalid', error: `amount must be a whole number of base units (nanoGRAM or jetton units), got "${amount}".` }
    r.amount = BigInt(amount)
  }
  const jetton = get('jetton')
  if (jetton) {
    const j = checkAddress(jetton)
    if (!j.ok) return { ok: false, kind: 'invalid', error: `jetton "${jetton}" is not a valid jetton master address.` }
    r.jetton = j.friendly
  }
  const text = get('text')
  if (text) r.text = text
  for (const k of ['bin', 'init'] as const) {
    const v = get(k)
    if (!v) continue
    const b = normalizeBoc(v)
    if (!b.ok) return { ok: false, kind: 'invalid', error: `${k}: ${b.error}` }
    r[k] = b.b64url
  }
  const exp = get('exp')
  if (exp) {
    if (!/^\d+$/.test(exp)) return { ok: false, kind: 'invalid', error: `exp must be a unix timestamp in seconds, got "${exp}".` }
    r.exp = Number(exp)
  }

  const extras: ShareExtras = {}
  if (parts.source === 'tonutils') {
    const dec = get('dec')
    if (dec && /^\d{1,3}$/.test(dec) && Number(dec) <= 255) extras.decimals = Number(dec)
    const label = get('label')
    if (label) extras.label = label.slice(0, 200)
    const since = get('since')
    if (since && /^\d+$/.test(since)) extras.since = Number(since)
    if (get('testnet') === '1') extras.testnet = true
  }

  if (r.text && r.bin) warnings.push('The link has both a text comment and a binary body (bin). Wallets attach the binary body, so the text is ignored.')
  if (r.bin && r.amount === undefined) warnings.push('The link has a binary body but no amount. Keeper requires an amount with bin.')
  if (r.bin && r.jetton) warnings.push('bin with jetton is not a documented combination; wallets may ignore one of them.')
  if (r.init) warnings.push('The link carries a StateInit (init): paying it deploys a smart contract. Only continue if you expected that.')
  if (parts.source === 'tonhub' && (r.jetton || r.bin)) warnings.push('Tonhub documents GRAM transfers only; jetton and bin may be ignored by Tonhub.')
  const unknown = params.map(p => p[0]).filter(k => !KNOWN_PARAMS.has(k) && !(parts.source === 'tonutils' && TONUTILS_PARAMS.has(k)))
  if (unknown.length) warnings.push(`Unknown parameter${unknown.length > 1 ? 's' : ''} ignored by wallets: ${[...new Set(unknown)].join(', ')}.`)

  return { ok: true, link: { source: parts.source, request: r, address: addr.address, bounceable: addr.bounceable, testOnly: addr.testOnly, extras, warnings, params } }
}

/** Reads the shared query (Vue Router query object) into a request; null without a valid `to`. */
export function requestFromQuery(q: Record<string, unknown>): ParsedLink | null {
  const s = Object.entries(q)
    .filter((e): e is [string, string] => typeof e[1] === 'string')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  if (typeof q.to !== 'string' || !q.to) return null
  const r = parsePaymentLink(`${HOSTED_PATH}?${s}`)
  return r.ok ? r.link : null
}

// ---------------------------------------------------------------- misc

/** Seconds left until `exp` (negative when expired), null without expiry. */
export const secondsLeft = (exp: number | undefined, now = Date.now() / 1000) => (exp === undefined ? null : Math.floor(exp - now))

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s % 60}s`
  return `${s}s`
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // no 0/O/1/I: easy to read aloud and retype

/** Random invoice reference like "INV-7K3QX9MZ" (40 bits from crypto.getRandomValues). */
export function newInvoiceId(random: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(8)
  return `INV-${Array.from(bytes, b => ALPHABET[b & 31]).join('')}`
}
