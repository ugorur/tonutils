// Metadata validation report: content cell -> URI -> JSON -> image -> what tonapi (Tonkeeper's backend) shows.
// Network calls happen in Tool.vue; everything here is pure and tested with real responses.
import type { Check, MetaKind } from '~/lib/jettons-dev/metadata'
import type { FetchCheck } from '~/lib/jettons-dev/fetchCheck'
import { resolveUri, uriScheme, validateMetadata } from '~/lib/jettons-dev/metadata'

export { validateMetadata, resolveUri, decodeContent } from '~/lib/jettons-dev/metadata'
export type { Check, CheckLevel, MetaKind } from '~/lib/jettons-dev/metadata'

export const KIND_LABEL: Record<MetaKind, string> = {
  'jetton': 'Jetton (token)',
  'nft-item': 'NFT item',
  'nft-collection': 'NFT collection'
}

/** tonapi account interfaces -> what to validate. */
export function kindFromInterfaces(interfaces: string[] | undefined): MetaKind | null {
  const i = new Set(interfaces ?? [])
  if (i.has('jetton_master')) return 'jetton'
  if (i.has('nft_item') || i.has('nft_sale') || [...i].some(x => x.startsWith('nft_item'))) return 'nft-item'
  if (i.has('nft_collection') || [...i].some(x => x.startsWith('nft_collection'))) return 'nft-collection'
  return null
}

/** URI checks before fetching. */
export function checkUri(uri: string): Check[] {
  const sc = uriScheme(uri)
  if (sc === 'https') return [{ level: 'ok', title: 'Metadata URI uses https' }]
  if (sc === 'ipfs') return [{ level: 'ok', title: 'Metadata URI is an IPFS link', detail: `Checked through ${resolveUri(uri)}. Wallets backed by tonapi resolve ipfs:// themselves.` }]
  if (sc === 'http') return [{ level: 'warn', title: 'Metadata URI uses plain http', detail: 'Some wallets and indexers refuse insecure URLs. Serve it over https.' }]
  return [{ level: 'error', title: 'Metadata URI is not an https or ipfs link', detail: uri.slice(0, 200) }]
}

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)

function reach(fc: FetchCheck, what: string): Check[] {
  if (fc.error) return [{ level: 'error', title: `${what} could not be loaded`, detail: fc.error }]
  const out: Check[] = []
  if (fc.redirects.length) out.push({ level: 'info', title: `${fc.redirects.length} redirect${fc.redirects.length > 1 ? 's' : ''}`, detail: `Ends at ${fc.finalUrl}` })
  out.push(fc.ok
    ? { level: 'ok', title: `${what} loads (HTTP ${fc.status}, ${fmtSize(fc.size)}, ${fc.ms} ms)` }
    : { level: 'error', title: `${what} returns HTTP ${fc.status}`, detail: 'Wallets get an error page instead of the file.' })
  if (fc.ms > 5000) out.push({ level: 'warn', title: 'Slow server', detail: `It took ${(fc.ms / 1000).toFixed(1)} s. Indexers may time out.` })
  return out
}

/** Reachability + JSON checks for the metadata file. Returns the parsed object when it is valid JSON. */
export function checkJsonFetch(fc: FetchCheck): { checks: Check[], json: Record<string, unknown> | null } {
  const checks = reach(fc, 'Metadata JSON')
  if (fc.error || !fc.ok) return { checks, json: null }
  if (fc.sniff === 'html') {
    checks.push({ level: 'error', title: 'The URI returns a web page, not JSON', detail: 'Point the URI at the raw .json file (for GitHub use raw.githubusercontent.com).' })
    return { checks, json: null }
  }
  if (fc.truncated || (fc.text === null && fc.sniff === 'json')) {
    checks.push({ level: 'error', title: 'The file is too big', detail: `Metadata JSON should be a few KB; this one is ${fmtSize(fc.size)}${fc.truncated ? '+' : ''}.` })
    return { checks, json: null }
  }
  if (fc.text === null) {
    checks.push({ level: 'error', title: 'Not valid JSON', detail: `The file does not start with { or [ (detected: ${fc.sniff ?? 'unknown'}, Content-Type: ${fc.contentType || 'none'}).` })
    return { checks, json: null }
  }
  let json: unknown
  try {
    json = JSON.parse(fc.text.replace(/^﻿/, ''))
  }
  catch (e) {
    checks.push({ level: 'error', title: 'Not valid JSON', detail: (e as Error).message })
    return { checks, json: null }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    checks.push({ level: 'error', title: 'The JSON is not an object', detail: 'Metadata must be { "name": …, … }.' })
    return { checks, json: null }
  }
  checks.push({ level: 'ok', title: 'Valid JSON object' })
  const ct = fc.contentType ?? ''
  if (!/json/i.test(ct)) checks.push({ level: 'warn', title: `Served as ${ct || 'no content type'}`, detail: 'Use Content-Type: application/json. Most indexers still read it.' })
  if (!fc.cors) checks.push({ level: 'info', title: 'No CORS header', detail: 'Fine for wallets (their servers fetch it), but browser dApps cannot read the file directly. Add Access-Control-Allow-Origin: * to allow that.' })
  return { checks, json: json as Record<string, unknown> }
}

/** Image file checks: loads, is an image, type matches, size, square. */
export function checkImageFetch(fc: FetchCheck, kind: MetaKind): Check[] {
  const checks = reach(fc, 'Image')
  if (fc.error || !fc.ok) return checks
  const ct = (fc.contentType ?? '').split(';')[0]!.trim().toLowerCase()
  const sniff = fc.sniff
  const isImage = sniff && sniff !== 'json' && sniff !== 'html'
  if (!isImage) {
    checks.push({ level: 'error', title: sniff === 'html' ? 'The image URL returns a web page' : 'The image URL does not return an image', detail: `Content-Type: ${ct || 'none'}` })
    return checks
  }
  checks.push({ level: 'ok', title: `Image format: ${sniff.toUpperCase()}` })
  if (!ct.startsWith('image/')) checks.push({ level: 'warn', title: `Served as ${ct || 'no content type'}`, detail: 'Send the right Content-Type (e.g. image/png). Some clients refuse other types.' })
  if (sniff === 'svg') checks.push({ level: 'warn', title: 'SVG image', detail: 'Several wallets do not render SVG token icons. PNG or WebP is safest.' })
  if (fc.truncated) checks.push({ level: 'warn', title: 'Image is larger than 2 MB', detail: 'Large images load slowly and some caches skip them. Keep icons under ~500 KB.' })
  else if (fc.size > 1024 * 1024) checks.push({ level: 'warn', title: `Image is ${fmtSize(fc.size)}`, detail: 'Keep icons under ~500 KB.' })
  if (fc.image) {
    const { width: w, height: h } = fc.image
    checks.push({ level: 'ok', title: `${w} × ${h} px` })
    if (kind !== 'nft-item' && Math.abs(w - h) > Math.max(w, h) * 0.02) checks.push({ level: 'warn', title: 'Not square', detail: 'Wallets crop icons to a circle or square.' })
    if (Math.min(w, h) < 128) checks.push({ level: 'warn', title: 'Small image', detail: 'Use at least 256 × 256 px so it stays sharp.' })
  }
  return checks
}

export interface TonapiView {
  name?: string
  symbol?: string
  decimals?: string
  image?: string
  description?: string
  /** Cached preview image tonapi/Tonkeeper actually shows. */
  preview?: string
  verification?: string
}

/** Compares our merged metadata with what tonapi indexed (what Tonkeeper shows). */
export function compareWithTonapi(meta: Record<string, unknown>, t: TonapiView, kind: MetaKind): Check[] {
  const out: Check[] = []
  const keys = kind === 'jetton' ? (['name', 'symbol', 'decimals', 'image'] as const) : (['name', 'image'] as const)
  for (const k of keys) {
    const ours = meta[k] === undefined || meta[k] === null ? undefined : String(meta[k])
    const theirs = t[k]
    if (theirs === undefined && ours === undefined) continue
    if (theirs === ours) out.push({ level: 'ok', title: `tonapi shows the same ${k}` })
    else if (theirs === undefined) out.push({ level: 'warn', title: `tonapi has no ${k}`, detail: 'It may not have re-indexed your metadata yet, or could not load it.' })
    else out.push({ level: 'warn', title: `tonapi shows a different ${k}`, detail: `tonapi: ${theirs.slice(0, 120)} · metadata: ${(ours ?? '(missing)').slice(0, 120)}. Indexers cache metadata; changes can take a while to appear.` })
  }
  if (kind === 'jetton' && t.verification) {
    out.push(t.verification === 'blacklist'
      ? { level: 'error', title: 'tonapi marks this jetton as a scam (blacklist)' }
      : { level: 'info', title: `tonapi verification: ${t.verification}`, detail: t.verification === 'none' ? 'Unverified jettons still show in wallets, often with a warning.' : undefined })
  }
  return out
}

export interface Section { title: string, checks: Check[] }

export function summarize(sections: Section[]): { errors: number, warnings: number } {
  const all = sections.flatMap(s => s.checks)
  return { errors: all.filter(c => c.level === 'error').length, warnings: all.filter(c => c.level === 'warn').length }
}

export const EXAMPLES = [
  { label: 'USD₮ (jetton, semi-chain)', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { label: 'stGRAM (jetton, on-chain)', value: 'EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k' },
  { label: 'TON Diamonds #1 (NFT)', value: 'EQCoADmGFboLrgOCDSwAe-jI-lOOVoRYllA5F4WeIMokINW8' }
] as const
