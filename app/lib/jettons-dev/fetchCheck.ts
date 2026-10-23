// URL check used by metadata-validator and jetton-metadata-codec. Pure TS (no @ton/*, no Buffer): the
// server route server/api/tools/metadata-validator/fetch.get.ts imports the same helpers.

/** What the server-side checker reports about one URL. It never relays HTML or binary bodies. */
export interface FetchCheck {
  url: string
  finalUrl: string
  redirects: string[]
  status: number
  ok: boolean
  contentType: string | null
  /** Bytes read (capped at MAX_FETCH_BYTES). */
  size: number
  truncated: boolean
  /** access-control-allow-origin header of the final response. */
  cors: string | null
  ms: number
  /** Detected file type from the first bytes. */
  sniff: ImageType | 'json' | 'html' | null
  image: { width: number, height: number } | null
  /** Body as text when it is JSON or SVG and at most MAX_TEXT_BYTES. */
  text: string | null
  error?: string
}

export const MAX_FETCH_BYTES = 2 * 1024 * 1024
export const MAX_TEXT_BYTES = 512 * 1024

export type ImageType = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'avif'

const latin1 = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

/** Magic-byte sniffing. */
export function sniffType(b: Uint8Array): FetchCheck['sniff'] {
  if (b[0] === 0x89 && latin1(b, 1, 4) === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (latin1(b, 0, 4) === 'GIF8') return 'gif'
  if (latin1(b, 0, 4) === 'RIFF' && latin1(b, 8, 12) === 'WEBP') return 'webp'
  if (latin1(b, 4, 12) === 'ftypavif') return 'avif'
  const t = new TextDecoder().decode(b.subarray(0, 512)).replace(/^﻿/, '').trimStart().toLowerCase()
  if (t.startsWith('<svg') || (t.startsWith('<?xml') && t.includes('<svg'))) return 'svg'
  if (t.startsWith('<!doctype html') || t.startsWith('<html') || t.startsWith('<head')) return 'html'
  if (t.startsWith('{') || t.startsWith('[')) return 'json'
  return null
}

/** Pixel size from the file header (PNG, GIF, WebP, JPEG). Null when unknown or truncated. */
export function imageSize(b: Uint8Array): { width: number, height: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8)
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
  const u32be = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
  const type = sniffType(b)
  try {
    if (type === 'png' && b.length >= 24) return { width: u32be(16), height: u32be(20) }
    if (type === 'gif' && b.length >= 10) return { width: u16le(6), height: u16le(8) }
    if (type === 'webp' && b.length >= 30) {
      const chunk = latin1(b, 12, 16)
      if (chunk === 'VP8X') return { width: 1 + u24le(24), height: 1 + u24le(27) }
      if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff }
      if (chunk === 'VP8L') {
        const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
    }
    if (type === 'jpeg') {
      let i = 2
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null
        const marker = b[i + 1]!
        if (marker === 0xff) {
          i++
          continue
        }
        // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: u16be(i + 7), height: u16be(i + 5) }
        }
        i += 2 + u16be(i + 2)
      }
    }
  }
  catch { /* fall through */ }
  return null
}

/** Rejects URLs the server must never fetch (non-http(s), local/private hosts, odd ports). Returns an error text or null. */
export function blockedUrlReason(u: URL): string | null {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only http(s) URLs can be checked'
  if (u.username || u.password) return 'URLs with credentials are not allowed'
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return 'Only ports 80, 443, 8080 and 8443 are allowed'
  const h = u.hostname.toLowerCase()
  if (h.startsWith('[') || h.includes(':')) return 'IPv6 literal hosts are not allowed'
  if (h === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(h) || !h.includes('.')) return 'Local host names are not allowed'
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'Private IP addresses are not allowed'
  }
  return null
}

/** Asks the TonUtils checker (most metadata hosts send no CORS headers, so the browser cannot read them directly). */
export async function checkUrl(url: string): Promise<FetchCheck> {
  const res = await fetch(`/api/tools/metadata-validator/fetch?url=${encodeURIComponent(url)}`, { headers: { accept: 'application/json' } })
  const body = await res.json().catch(() => null) as FetchCheck | { message?: string, statusMessage?: string } | null
  if (!res.ok || !body || !('status' in body)) {
    const msg = (body as { message?: string, statusMessage?: string } | null)
    throw new Error(msg?.statusMessage || msg?.message || `URL check failed (${res.status})`)
  }
  return body
}
