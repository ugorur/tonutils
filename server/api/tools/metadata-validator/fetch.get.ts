// Metadata URL checker for metadata-validator / jetton-metadata-codec.
// Most token metadata hosts send no CORS headers, so the browser cannot read them. This route fetches one public
// http(s) URL (GET only, no cookies or auth, private/local hosts refused, every redirect re-checked, 10 s timeout,
// 2 MB cap) and returns a JSON report. It never relays HTML or binary bodies: only JSON/SVG up to 512 KB.
import type { FetchCheck } from '../../../../app/lib/jettons-dev/fetchCheck'
import { MAX_FETCH_BYTES, MAX_TEXT_BYTES, blockedUrlReason, imageSize, sniffType } from '../../../../app/lib/jettons-dev/fetchCheck'

const MAX_REDIRECTS = 4

async function readCapped(res: Response): Promise<{ bytes: Uint8Array, truncated: boolean }> {
  const reader = res.body?.getReader()
  if (!reader) return { bytes: new Uint8Array(), truncated: false }
  const parts: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    size += value.length
    if (size > MAX_FETCH_BYTES) {
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
  }
  const out = new Uint8Array(Math.min(size, MAX_FETCH_BYTES))
  let off = 0
  for (const p of parts) {
    const take = Math.min(p.length, out.length - off)
    out.set(p.subarray(0, take), off)
    off += take
    if (off >= out.length) break
  }
  return { bytes: out, truncated }
}

export default defineEventHandler(async (event): Promise<FetchCheck> => {
  const raw = getQuery(event).url
  if (typeof raw !== 'string' || !raw || raw.length > 2048) {
    throw createError({ statusCode: 400, statusMessage: 'Pass one http(s) URL (max 2048 characters) as ?url=' })
  }
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Not a valid URL' })
  }
  const blocked = blockedUrlReason(url)
  if (blocked) throw createError({ statusCode: 400, statusMessage: blocked })

  const started = Date.now()
  const redirects: string[] = []
  const base: FetchCheck = {
    url: raw, finalUrl: url.href, redirects, status: 0, ok: false, contentType: null, size: 0, truncated: false,
    cors: null, ms: 0, sniff: null, image: null, text: null
  }
  setResponseHeader(event, 'cache-control', 'public, max-age=60')

  let res: Response
  try {
    for (let i = 0; ; i++) {
      res = await fetch(url.href, {
        redirect: 'manual',
        headers: { 'accept': 'application/json, image/*;q=0.9, */*;q=0.5', 'user-agent': 'TonUtils-metadata-validator/1.0 (+https://tonutils.io/tools/metadata-validator)' },
        signal: AbortSignal.timeout(10_000)
      })
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        if (i >= MAX_REDIRECTS) return { ...base, status: res.status, ms: Date.now() - started, error: `More than ${MAX_REDIRECTS} redirects` }
        const next = new URL(loc, url)
        const why = blockedUrlReason(next)
        if (why) return { ...base, status: res.status, ms: Date.now() - started, error: `Redirect to ${next.href} refused: ${why}` }
        await res.body?.cancel().catch(() => {})
        url = next
        redirects.push(next.href)
        continue
      }
      break
    }
  }
  catch (e) {
    const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError'
    return { ...base, finalUrl: url.href, ms: Date.now() - started, error: timeout ? 'No answer within 10 seconds' : `Could not connect: ${(e as Error).message}` }
  }

  let body: { bytes: Uint8Array, truncated: boolean }
  try {
    body = await readCapped(res!)
  }
  catch (e) {
    const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError'
    return { ...base, finalUrl: url.href, status: res!.status, ms: Date.now() - started, error: timeout ? 'The file did not finish loading within 10 seconds' : `The download broke off: ${(e as Error).message}` }
  }
  const { bytes, truncated } = body
  const contentType = res!.headers.get('content-type')
  const sniff = sniffType(bytes)
  // Only metadata-shaped bodies are relayed (JSON, SVG), so the route is no general-purpose CORS proxy.
  const textual = sniff === 'json' || sniff === 'svg'
  return {
    ...base,
    finalUrl: url.href,
    status: res!.status,
    ok: res!.ok,
    contentType,
    size: bytes.length,
    truncated,
    cors: res!.headers.get('access-control-allow-origin'),
    ms: Date.now() - started,
    sniff,
    image: imageSize(bytes),
    text: textual && !truncated && bytes.length <= MAX_TEXT_BYTES ? new TextDecoder().decode(bytes) : null
  }
})
