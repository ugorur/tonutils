// TonConnect connect-link decoder (spec: ton-connect deeplinks.md, connect.md, manifest.md). Pure TS, no @ton/*.
import type { FetchCheck } from '~/lib/jettons-dev/fetchCheck'
import { NANO_NAME } from '~/utils/currency'

export type Severity = 'danger' | 'warn' | 'info' | 'ok'
export interface Finding { severity: Severity, title: string, detail: string }

export interface ConnectItem { name: string, payload?: string, network?: string }
export interface ConnectRequest { manifestUrl: string, items: ConnectItem[] }

export interface EmbeddedMessage { address: string, amount: string, payload?: string, stateInit?: string, extraCurrency?: Record<string, string> }
export interface EmbeddedItem { type: string, fields: { label: string, value: string }[] }
export interface EmbeddedRequest {
  method: 'sendTransaction' | 'signMessage' | 'signData'
  from?: string
  network?: string
  validUntil?: number
  messages?: EmbeddedMessage[]
  items?: EmbeddedItem[]
  signData?: { type: string, text?: string, bytes?: string, schema?: string, cell?: string }
}

export interface DecodedLink {
  form: 'tc' | 'universal' | 'custom-scheme' | 'telegram' | 'json'
  /** Where the link opens: wallet host or scheme. */
  opensIn?: string
  version?: string
  clientId?: string
  traceId?: string
  ret?: string
  request: ConnectRequest
  embedded?: EmbeddedRequest
  findings: Finding[]
}

/** Inverse of @tonconnect/sdk encodeTelegramUrlParameters (Telegram mangles ASCII punctuation in start params). */
export function decodeTelegramParams(s: string): string {
  return s.replaceAll('--', '%').replaceAll('__', '=').replaceAll('-', '&').replaceAll('%5F', '_').replaceAll('%2D', '-').replaceAll('%2E', '.')
}

/** Parses a tc://, universal (https), wallet-scheme or Telegram connect link, or a bare ConnectRequest JSON. Throws a readable Error. */
export function parseConnectLink(input: string): DecodedLink {
  const raw = input.trim()
  if (!raw) throw new Error('Paste a TonConnect link or scan its QR code.')
  if (raw.startsWith('{')) return finish({ form: 'json', request: parseRequest(raw) }, new URLSearchParams())

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase()
  if (!scheme) throw new Error('This is not a link. TonConnect links start with tc://, https:// or a wallet scheme like tonkeeper-tc://.')
  let qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0]! : ''
  let form: DecodedLink['form'] = scheme === 'tc' ? 'tc' : scheme === 'https' || scheme === 'http' ? 'universal' : 'custom-scheme'
  let opensIn = form === 'universal' ? undefined : `${scheme}://`

  if (form === 'universal') {
    const u = new URL(raw)
    opensIn = u.host + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''))
    if (/^(t|telegram)\.me$/i.test(u.hostname)) {
      const start = u.searchParams.get('startapp') ?? u.searchParams.get('startattach') ?? ''
      if (!start.startsWith('tonconnect-')) throw new Error('This Telegram link carries no TonConnect request (no startapp=tonconnect-…).')
      qs = decodeTelegramParams(start.slice('tonconnect-'.length))
      form = 'telegram'
      opensIn = `t.me${u.pathname.replace(/\/start$/, '')}`
    }
  }
  const p = new URLSearchParams(qs)
  const r = p.get('r')
  if (!r) throw new Error('No connect request in this link (the r= parameter is missing). It may be a plain wallet link, not a TonConnect request.')
  return finish({ form, opensIn, version: p.get('v') ?? undefined, clientId: p.get('id') ?? undefined, traceId: p.get('trace_id') ?? undefined, ret: p.get('ret') ?? undefined, request: parseRequest(r) }, p)
}

function parseRequest(json: string): ConnectRequest {
  let o: { manifestUrl?: unknown, items?: unknown }
  try {
    o = JSON.parse(json)
  }
  catch {
    throw new Error('The connect request (r=) is not valid JSON. The link is broken or was cut off.')
  }
  if (typeof o?.manifestUrl !== 'string') throw new Error('The connect request has no manifestUrl.')
  const items = Array.isArray(o.items) ? o.items.filter((i): i is ConnectItem => typeof i?.name === 'string') : []
  return { manifestUrl: o.manifestUrl, items }
}

function b64urlJson(s: string): unknown {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
}

const ITEM_LABELS: Record<string, string> = {
  a: 'To', am: 'Amount (smallest units)', p: 'Payload (BOC)', si: 'StateInit (BOC)', ma: 'Jetton master', d: 'Recipient', aa: `Attached (${NANO_NAME})`,
  rd: 'Excess goes to', cp: 'Custom payload', fa: `Forward amount (${NANO_NAME})`, fp: 'Forward payload', qi: 'Query id', na: 'NFT', no: 'New owner', ec: 'Extra currencies'
}

/** Expands the `e` parameter (EmbeddedWireRequest, base64url JSON) to readable form. */
export function expandEmbedded(e: string): EmbeddedRequest {
  let w: Record<string, unknown>
  try {
    w = b64urlJson(e) as Record<string, unknown>
  }
  catch {
    throw new Error('The embedded request (e=) cannot be decoded.')
  }
  const m = w.m
  const base = { from: w.f as string | undefined, network: w.n as string | undefined }
  if (m === 'sd') {
    return { method: 'signData', ...base, signData: { type: String(w.t), text: w.tx as string | undefined, bytes: w.b as string | undefined, schema: w.s as string | undefined, cell: w.c as string | undefined } }
  }
  if (m !== 'st' && m !== 'sm') throw new Error(`Unknown embedded request type "${String(m)}".`)
  const out: EmbeddedRequest = { method: m === 'st' ? 'sendTransaction' : 'signMessage', ...base, validUntil: typeof w.vu === 'number' ? w.vu : undefined }
  const msg = (x: Record<string, unknown>): EmbeddedMessage => ({ address: String(x.a), amount: String(x.am), payload: x.p as string | undefined, stateInit: x.si as string | undefined, extraCurrency: x.ec as Record<string, string> | undefined })
  const items = Array.isArray(w.i) ? w.i as Record<string, unknown>[] : []
  // Plain coin items are ordinary messages, so they get the same preview as `ms`.
  const coinItems = items.filter(x => x.t === 'ton')
  if (Array.isArray(w.ms) || coinItems.length) out.messages = [...(Array.isArray(w.ms) ? w.ms as Record<string, unknown>[] : []), ...coinItems].map(msg)
  if (items.length > coinItems.length) {
    out.items = items.filter(x => x.t !== 'ton').map(x => ({
      type: String(x.t),
      fields: Object.entries(x).filter(([k]) => k !== 't').map(([k, v]) => ({ label: ITEM_LABELS[k] ?? k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }))
    }))
  }
  return out
}

// ---------------------------------------------------------------- phishing heuristics

/** Brand tokens and their official registrable domains. */
const BRANDS: { tokens: string[], name: string, domains: string[] }[] = [
  { tokens: ['tonkeeper'], name: 'Tonkeeper', domains: ['tonkeeper.com'] },
  { tokens: ['ston', 'stonfi'], name: 'STON.fi', domains: ['ston.fi'] },
  { tokens: ['dedust'], name: 'DeDust', domains: ['dedust.io'] },
  { tokens: ['getgems'], name: 'Getgems', domains: ['getgems.io'] },
  { tokens: ['fragment'], name: 'Fragment', domains: ['fragment.com'] },
  { tokens: ['tonstakers'], name: 'Tonstakers', domains: ['tonstakers.com'] },
  { tokens: ['mytonwallet'], name: 'MyTonWallet', domains: ['mytonwallet.io', 'mytonwallet.org'] },
  { tokens: ['telegram'], name: 'Telegram', domains: ['telegram.org', 't.me'] },
  { tokens: ['tonviewer'], name: 'Tonviewer', domains: ['tonviewer.com'] },
  { tokens: ['tonscan'], name: 'Tonscan', domains: ['tonscan.org'] },
  { tokens: ['evaa'], name: 'EVAA', domains: ['evaa.finance'] },
  { tokens: ['notcoin'], name: 'Notcoin', domains: ['notco.in'] }
]

// Hosting suffixes where every customer gets their own subdomain (phishing kits love them), plus common ccSLDs.
// ponytail: short list instead of the full Public Suffix List; add suffixes here when a miss shows up.
const SHARED_SUFFIXES = new Set(['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'herokuapp.com', 'onrender.com', 'glitch.me', 'replit.app', 'surge.sh', 'co.uk', 'com.au', 'com.br', 'co.jp', 'com.tr'])
/** Registrable domain: last two labels, or three under a shared hosting suffix. */
export function registrable(host: string): string {
  const l = host.toLowerCase().replace(/\.$/, '').split('.')
  return l.slice(SHARED_SUFFIXES.has(l.slice(-2).join('.')) ? -3 : -2).join('.')
}

/** A host (or app name) that uses a known brand on a domain the brand does not own. */
export function lookalike(host: string, name = ''): string | null {
  const reg = registrable(host)
  const tokens = new Set(`${host} ${name}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  for (const b of BRANDS) {
    if (b.tokens.some(t => tokens.has(t)) && !b.domains.includes(reg)) return `Uses the name ${b.name}, but ${b.name}'s official domain is ${b.domains.join(' / ')}, not ${reg}.`
  }
  return null
}

function hostRisks(host: string): string | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'The host is a bare IP address. Real apps use a domain name.'
  if (host.split('.').some(l => l.startsWith('xn--'))) return `The host is an internationalised (punycode) domain: ${host}. Letters that look Latin may be Cyrillic or Greek look-alikes.`
  return null
}

function finish(d: Omit<DecodedLink, 'findings'>, p: URLSearchParams): DecodedLink {
  const f: Finding[] = []
  let embedded: EmbeddedRequest | undefined
  const e = p.get('e')
  if (e) {
    embedded = expandEmbedded(e)
    f.push(embedded.method === 'signData'
      ? { severity: 'warn', title: 'Also asks you to sign data', detail: 'Right after you connect, the wallet will ask you to sign the data shown below. Read it carefully.' }
      : { severity: 'danger', title: embedded.method === 'sendTransaction' ? 'Also asks you to SEND a transaction' : 'Also asks you to sign a transaction', detail: 'This is not just a connection: right after you approve, your wallet will be asked to sign the transaction shown below. Drainers use this to empty wallets in one tap.' })
  }
  if (d.version && d.version !== '2') f.push({ severity: 'warn', title: 'Unknown protocol version', detail: `v=${d.version}; wallets only accept v=2.` })
  if (d.form !== 'json' && !/^[0-9a-f]{64}$/i.test(d.clientId ?? '')) f.push({ severity: 'warn', title: 'Malformed session id', detail: 'id= should be a 64-character hex key. Wallets will refuse this link.' })

  let manifestHost = ''
  try {
    const u = new URL(d.request.manifestUrl)
    manifestHost = u.hostname
    if (u.protocol !== 'https:') f.push({ severity: 'danger', title: 'Manifest is not on HTTPS', detail: `${d.request.manifestUrl} can be altered in transit.` })
    const risk = hostRisks(u.hostname)
    if (risk) f.push({ severity: 'warn', title: 'Unusual manifest host', detail: risk })
    const look = lookalike(u.hostname)
    if (look) f.push({ severity: 'danger', title: 'Look-alike domain', detail: look })
  }
  catch {
    f.push({ severity: 'danger', title: 'Invalid manifest URL', detail: d.request.manifestUrl })
  }

  for (const it of d.request.items) {
    if (it.name === 'ton_addr') f.push({ severity: 'info', title: 'Shares your wallet address', detail: `The site learns your address and public key${it.network ? ` (asks for network ${it.network === '-239' ? 'mainnet' : it.network === '-3' ? 'testnet' : it.network})` : ''}. It cannot move funds by itself.` })
    else if (it.name === 'ton_proof') f.push({ severity: 'info', title: 'Asks for a login proof (ton_proof)', detail: 'Your wallet signs a statement that you own the address, for the site in the manifest. It cannot move funds.' })
    else f.push({ severity: 'warn', title: `Unknown item "${it.name}"`, detail: 'Not part of the TonConnect spec; wallets will reject it.' })
  }
  if (d.ret && d.ret !== 'back' && d.ret !== 'none') {
    let retHost = ''
    try {
      const u = new URL(d.ret)
      if (u.protocol === 'https:' || u.protocol === 'http:') retHost = u.hostname
    }
    catch { /* not a URL */ }
    f.push(manifestHost && retHost && registrable(retHost) === registrable(manifestHost)
      ? { severity: 'info', title: 'Returns to the app after approval', detail: `The wallet then opens ${d.ret}.` }
      : { severity: 'warn', title: 'Sends you somewhere else after approval', detail: `After you approve, the wallet opens ${d.ret}, which is not the manifest's domain (${manifestHost}).` })
  }
  return { ...d, embedded, findings: f }
}

// ---------------------------------------------------------------- manifest

export interface Manifest { url: string, name: string, iconUrl: string, termsOfUseUrl?: string, privacyPolicyUrl?: string }
export interface ManifestReport { manifest: Manifest | null, appHost: string | null, findings: Finding[] }

/** Checks a fetched manifest the way a wallet would, plus phishing signals. */
export function analyzeManifest(manifestUrl: string, check: FetchCheck): ManifestReport {
  const f: Finding[] = []
  if (check.error || !check.ok) {
    f.push({ severity: 'danger', title: 'Manifest cannot be loaded', detail: `${check.error ?? `HTTP ${check.status}`}. Wallets will refuse to connect (error 2, manifest not found). A dead manifest is common for phishing pages that were taken down.` })
    return { manifest: null, appHost: null, findings: f }
  }
  let m: Partial<Manifest> | null = null
  try {
    m = check.text ? JSON.parse(check.text) : null
  }
  catch { /* reported below */ }
  if (!m || typeof m !== 'object') {
    f.push({ severity: 'danger', title: 'Manifest is not JSON', detail: 'Wallets will refuse to connect (error 3, manifest content error).' })
    return { manifest: null, appHost: null, findings: f }
  }
  const missing = (['url', 'name', 'iconUrl'] as const).filter(k => typeof m![k] !== 'string' || !m![k])
  if (missing.length) f.push({ severity: 'warn', title: 'Required fields missing', detail: `${missing.join(', ')} missing; wallets may refuse to connect.` })
  let appHost: string | null = null
  try {
    appHost = new URL(m.url!).hostname
  }
  catch { /* missing or invalid url */ }
  const manifestHost = new URL(check.finalUrl || manifestUrl).hostname
  if (appHost) {
    f.push({ severity: 'info', title: 'Your wallet will show this site', detail: `"${m.name ?? '?'}" at ${appHost}. Login proofs and signatures name ${appHost}.` })
    if (registrable(appHost) !== registrable(manifestHost)) f.push({ severity: 'warn', title: 'Manifest hosted elsewhere', detail: `The manifest lives on ${manifestHost} but claims to be the app at ${appHost}. Legit apps sometimes do this (CDN, GitHub), but a copied manifest is also how phishing sites borrow a real app's name.` })
    const look = lookalike(appHost, m.name)
    if (look) f.push({ severity: 'danger', title: 'Look-alike app', detail: look })
    const risk = hostRisks(appHost)
    if (risk) f.push({ severity: 'warn', title: 'Unusual app host', detail: risk })
  }
  if (check.redirects.length) f.push({ severity: 'info', title: 'Manifest URL redirects', detail: check.redirects.join(' → ') })
  if (check.cors !== '*') f.push({ severity: 'info', title: 'No open CORS header', detail: 'Browser-extension and web wallets may fail to read this manifest (native wallets are not affected).' })
  if (typeof m.iconUrl === 'string' && /\.svg(\?|$)/i.test(m.iconUrl)) f.push({ severity: 'warn', title: 'SVG icon', detail: 'The spec forbids SVG icons; wallets may show a placeholder.' })
  if ('version' in m) f.push({ severity: 'warn', title: 'Reserved "version" field', detail: 'The spec reserves it; wallet behaviour is undefined.' })
  return { manifest: m as Manifest, appHost, findings: f }
}

const ORDER: Record<Severity, number> = { danger: 0, warn: 1, info: 2, ok: 3 }
export const sortFindings = (f: Finding[]) => [...f].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])

/** Overall verdict for the banner. */
export function verdict(f: Finding[]): Severity {
  if (f.some(x => x.severity === 'danger')) return 'danger'
  if (f.some(x => x.severity === 'warn')) return 'warn'
  return 'ok'
}
