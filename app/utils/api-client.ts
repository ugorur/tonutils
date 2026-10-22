// Tiny rate-limited JSON client for keyless public TON APIs (toncenter ~1 rps, tonapi similar).
// One queue per host, spaced requests, retry on 429/5xx with backoff. Pure TS, no Vue.

export type ApiProvider = 'toncenter' | 'tonapi'

export class TonApiError extends Error {
  constructor(
    message: string,
    readonly provider: ApiProvider,
    /** HTTP status, or 0 for network failures. */
    readonly status: number,
    readonly url: string,
    readonly body?: unknown
  ) {
    super(message)
    this.name = 'TonApiError'
  }

  get isRateLimit() {
    return this.status === 429
  }
}

export interface ClientOptions {
  provider: ApiProvider
  /** Minimum gap between requests to the same host, ms. */
  minIntervalMs?: number
  /** Retries after the first attempt on 429 / 5xx / network errors. */
  retries?: number
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
// host -> tail of that host's request chain; shared by every client in the page
const queues = new Map<string, Promise<unknown>>()

export function buildUrl(base: string, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(base.replace(/\/$/, '') + '/' + path.replace(/^\//, ''))
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function rateLimitedJson<T>(url: string, opts: ClientOptions, init?: RequestInit): Promise<T> {
  const { provider, minIntervalMs = 1100, retries = 3, fetchFn = fetch, sleep = realSleep } = opts
  const host = new URL(url).host

  const attempt = async (n: number): Promise<T> => {
    // Serialize per host: wait for the previous request, then keep the slot for minIntervalMs.
    const prev = queues.get(host) ?? Promise.resolve()
    let release!: () => void
    const slot = new Promise<void>(r => (release = r))
    queues.set(host, prev.then(() => slot))
    await prev
    setTimeout(release, minIntervalMs)

    let res: Response
    try {
      res = await fetchFn(url, { ...init, headers: { accept: 'application/json', ...init?.headers } })
    }
    catch (e) {
      if (n < retries) {
        await sleep(500 * 2 ** n)
        return attempt(n + 1)
      }
      throw new TonApiError(`Network error: ${(e as Error).message}`, provider, 0, url)
    }

    if ((res.status === 429 || res.status >= 500) && n < retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** n)
      return attempt(n + 1)
    }

    const text = await res.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : undefined
    }
    catch { /* keep text */ }

    if (!res.ok) {
      const msg = (body as { error?: string, result?: string } | undefined)
      throw new TonApiError(
        res.status === 429
          ? `${provider} rate limit reached. Wait a few seconds and try again.`
          : `${provider} error ${res.status}: ${msg?.error ?? msg?.result ?? res.statusText}`,
        provider, res.status, url, body
      )
    }
    return body as T
  }

  return attempt(0)
}
