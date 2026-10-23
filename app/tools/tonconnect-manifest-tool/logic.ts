// TonConnect app manifest generator and validator.
// Rules come from the normative spec: ton-blockchain/ton-connect spec/manifest.md, schemas/manifest.schema.json
// and connect.md § Domain-binding rules. Pure TS, no Vue, no @ton/*.

export interface ManifestFields {
  url: string
  name: string
  iconUrl: string
  termsOfUseUrl?: string
  privacyPolicyUrl?: string
}

export type Level = 'error' | 'warn' | 'ok' | 'info'
export interface Check { level: Level, title: string, detail?: string }

const KNOWN = new Set(['url', 'name', 'iconUrl', 'termsOfUseUrl', 'privacyPolicyUrl'])
const URL_FIELDS = ['url', 'iconUrl', 'termsOfUseUrl', 'privacyPolicyUrl'] as const

/** Manifest JSON for the form. Trims values, drops empty optional fields and the trailing slash of `url`. */
export function buildManifest(f: ManifestFields): string {
  const out: Record<string, string> = {
    url: f.url.trim().replace(/\/+$/, ''),
    name: f.name.trim(),
    iconUrl: f.iconUrl.trim()
  }
  if (f.termsOfUseUrl?.trim()) out.termsOfUseUrl = f.termsOfUseUrl.trim()
  if (f.privacyPolicyUrl?.trim()) out.privacyPolicyUrl = f.privacyPolicyUrl.trim()
  return JSON.stringify(out, null, 2) + '\n'
}

/**
 * The manifest URL to fetch for what the user typed: a manifest URL as is, or a site
 * (`example.com`, `https://example.com/app`) → `<origin>/tonconnect-manifest.json` (the conventional location).
 */
export function manifestUrlFrom(input: string): string {
  let s = input.trim()
  if (!s) throw new Error('Enter a manifest URL or a site address.')
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(s)) s = `https://${s}`
  let u: URL
  try {
    u = new URL(s)
  }
  catch {
    throw new Error('That is not a valid URL.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs can be checked.')
  const looksLikeFile = /\.[a-z\d]+$/i.test(u.pathname) || u.search !== ''
  return looksLikeFile ? u.toString() : `${u.origin}/tonconnect-manifest.json`
}

function httpsUrl(v: string): URL | null {
  if (!/^https:\/\/.+/.test(v)) return null
  try {
    return new URL(v)
  }
  catch {
    return null
  }
}

/** connect.md § Domain-binding rules: at least one dot with valid characters on both sides. */
export function domainBindingOk(host: string): boolean {
  return /^[^.]+(\.[^.]+)+$/.test(host)
}

/** The host wallets put into ton_proof / signData as AppDomain. */
export function appDomain(manifest: { url?: unknown }): string | null {
  return typeof manifest.url === 'string' ? httpsUrl(manifest.url)?.host ?? null : null
}

/** Checks the manifest object against the spec and schema. */
export function checkManifest(value: unknown): Check[] {
  const c: Check[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ level: 'error', title: 'Not a JSON object', detail: 'The manifest must be a JSON object with url, name and iconUrl.' }]
  }
  const m = value as Record<string, unknown>

  for (const k of ['url', 'name', 'iconUrl'] as const) {
    if (m[k] === undefined) c.push({ level: 'error', title: `Missing required field "${k}"` })
    else if (typeof m[k] !== 'string') c.push({ level: 'error', title: `"${k}" must be a string` })
  }
  if (typeof m.name === 'string' && !m.name.trim()) c.push({ level: 'error', title: '"name" is empty', detail: 'Wallets show it in the connect prompt.' })

  for (const k of URL_FIELDS) {
    const v = m[k]
    if (v === undefined || typeof v !== 'string') {
      if (v !== undefined) c.push({ level: 'error', title: `"${k}" must be a string` })
      continue
    }
    if (!httpsUrl(v)) c.push({ level: 'error', title: `"${k}" is not an https:// URL`, detail: `${v || '(empty)'}. The schema requires https.` })
  }

  const url = typeof m.url === 'string' ? httpsUrl(m.url) : null
  if (url) {
    if (!domainBindingOk(url.hostname)) {
      c.push({ level: 'error', title: 'App domain is not a public domain name', detail: `"${url.hostname}" has no dot. Names without a dot are reserved for native wallet integrations and wallets reject them (connect.md, domain-binding rules).` })
    }
    if (m.url !== '' && (m.url as string).endsWith('/')) {
      c.push({ level: 'warn', title: '"url" ends with a slash', detail: `The spec says it SHOULD NOT. Use "${(m.url as string).replace(/\/+$/, '')}".` })
    }
    c.push({ level: 'info', title: `App domain: ${url.host}`, detail: 'Wallets bind ton_proof and signData signatures to this host. Your backend must check the same domain.' })
  }

  if (typeof m.iconUrl === 'string' && httpsUrl(m.iconUrl)) {
    const ext = new URL(m.iconUrl).pathname.toLowerCase().match(/\.([a-z\d]+)$/)?.[1]
    if (ext === 'svg' || ext === 'svgz') c.push({ level: 'error', title: 'Icon is an SVG', detail: 'SVG icons MUST NOT be used. Serve a 180×180 PNG.' })
    else if (ext && ext !== 'png' && ext !== 'ico') c.push({ level: 'warn', title: `Icon is a .${ext} file`, detail: 'PNG (recommended) and ICO are the interoperable formats. Other formats may not show in every wallet.' })
  }

  if ('version' in m) c.push({ level: 'error', title: 'Remove the "version" field', detail: 'It is reserved for a future revision. Serving it today causes undefined wallet behaviour.' })
  const extra = Object.keys(m).filter(k => !KNOWN.has(k) && k !== 'version')
  if (extra.length) c.push({ level: 'info', title: `Unknown fields are ignored: ${extra.join(', ')}` })

  if (!c.some(x => x.level === 'error' || x.level === 'warn')) c.unshift({ level: 'ok', title: 'Manifest matches the TonConnect spec' })
  return c
}

/** What the browser could see of the manifest response. */
export interface FetchResult {
  requestedUrl: string
  /** null when fetch() itself failed (CORS block, DNS, TLS, offline: the browser does not say which). */
  status: number | null
  error?: string
  finalUrl?: string
  redirected?: boolean
  contentType?: string | null
  cacheControl?: string | null
  body?: string
}

export interface HostedReport { checks: Check[], manifest: Record<string, unknown> | null }

/** Checks the HTTP side (reachable cross-origin, status, JSON, headers) and then the manifest itself. */
export function checkHosted(r: FetchResult): HostedReport {
  const c: Check[] = []
  if (!r.requestedUrl.startsWith('https://')) c.push({ level: 'error', title: 'Manifest URL is not https', detail: 'Wallets fetch the manifest over HTTPS.' })

  if (r.status === null) {
    c.push({
      level: 'error',
      title: 'Your browser could not read the manifest',
      detail: `${r.error ?? 'Request failed'}. Usually the server does not send Access-Control-Allow-Origin, or the URL is unreachable. Wallets that fetch it from a web page, like this one, fail with error 2 (manifest not found). Native apps are not limited by CORS. Fix: serve the file with "Access-Control-Allow-Origin: *".`
    })
    return { checks: c, manifest: null }
  }
  c.push({ level: 'ok', title: 'Readable from another origin (CORS allows it)' })

  if (r.redirected && r.finalUrl && r.finalUrl !== r.requestedUrl) {
    c.push({ level: 'warn', title: 'The manifest URL redirects', detail: `Final URL: ${r.finalUrl}. Point manifestUrl at the final address so every wallet gets it in one request.` })
  }
  if (r.status !== 200) {
    c.push({ level: 'error', title: `HTTP ${r.status}`, detail: 'The manifest must return 200 to an unauthenticated GET. Wallets will reject the connection.' })
    return { checks: c, manifest: null }
  }

  const ct = (r.contentType ?? '').toLowerCase()
  if (!ct.includes('application/json')) c.push({ level: 'warn', title: `Content-Type is "${r.contentType ?? 'missing'}"`, detail: 'It SHOULD be application/json. Some wallets accept other text types, not all.' })
  if (!r.cacheControl) c.push({ level: 'info', title: 'No Cache-Control header', detail: 'Wallets may then cache the manifest for up to 24 hours. Suggested: "Cache-Control: public, max-age=3600".' })
  else c.push({ level: 'info', title: `Cache-Control: ${r.cacheControl}` })

  let parsed: unknown
  try {
    parsed = JSON.parse((r.body ?? '').replace(/^﻿/, ''))
  }
  catch (e) {
    c.push({ level: 'error', title: 'Not valid JSON', detail: `${(e as Error).message}. Wallets reply with error 3 (manifest content error).` })
    return { checks: c, manifest: null }
  }
  const mc = checkManifest(parsed)
  const manifest = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  const appHost = manifest ? appDomain(manifest) : null
  const fileHost = new URL(r.finalUrl || r.requestedUrl).host
  if (appHost && appHost !== fileHost) {
    mc.push({ level: 'info', title: 'Manifest is hosted on another domain', detail: `File on ${fileHost}, app at ${appHost}. Allowed, but the conventional place is ${appHost}/tonconnect-manifest.json.` })
  }
  return { checks: [...c, ...mc], manifest }
}

/** What the browser could see of the icon. */
export interface IconResult {
  /** null when the image failed to load. */
  width: number | null
  height: number | null
  /** From a CORS fetch; null when the server does not allow reading it. */
  contentType?: string | null
}

export function checkIcon(r: IconResult): Check[] {
  if (r.width === null || r.height === null) {
    return [{ level: 'warn', title: 'Icon did not load', detail: 'Wallets show a placeholder instead. Check that the URL is public and is a PNG.' }]
  }
  const c: Check[] = []
  const ct = r.contentType?.toLowerCase().split(';')[0]?.trim()
  if (ct === 'image/svg+xml') c.push({ level: 'error', title: 'Icon is served as SVG', detail: 'SVG MUST NOT be used.' })
  else if (ct && ct !== 'image/png' && ct !== 'image/x-icon' && ct !== 'image/vnd.microsoft.icon') c.push({ level: 'warn', title: `Icon is served as ${ct}`, detail: 'PNG (recommended) or ICO work everywhere.' })
  if (r.width !== r.height) c.push({ level: 'warn', title: `Icon is not square (${r.width}×${r.height})`, detail: 'Wallets crop or stretch it. Use 180×180.' })
  else if (r.width !== 180) c.push({ level: 'info', title: `Icon is ${r.width}×${r.height}`, detail: '180×180 px is the recommended size.' })
  else c.push({ level: 'ok', title: 'Icon is 180×180' })
  return c
}

export const LEVEL_ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, ok: 3 }
export const sortChecks = (c: Check[]) => [...c].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
