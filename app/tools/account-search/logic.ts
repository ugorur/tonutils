import { isDomainName, toRaw } from '~/lib/accounts/core'

/** tonapi /v2/accounts/search item. `name` is "Display name · kind". */
export interface TonapiSearchItem {
  address: string
  name: string
  preview?: string
  /** 'whitelist' = reviewed by tonapi, 'none' = anything else (self-registered names, unknown tokens). */
  trust: string
}

export type ResultKind = 'account' | 'jetton' | 'collection' | 'other'

export interface SearchResult {
  /** Lowercase raw address. */
  raw: string
  title: string
  kind: ResultKind
  verified: boolean
  /** The title is a .ton / .t.me name (anyone can register one). */
  domain: boolean
  image?: string
}

export type SearchInput =
  | { kind: 'empty' }
  | { kind: 'short' }
  | { kind: 'address', raw: string }
  | { kind: 'text', q: string, domain: boolean }

export const MIN_QUERY = 3

export function classifyInput(input: string): SearchInput {
  const q = input.trim()
  if (!q) return { kind: 'empty' }
  try {
    return { kind: 'address', raw: toRaw(q) }
  }
  catch { /* not an address */ }
  if (q.length < MIN_QUERY) return { kind: 'short' }
  return { kind: 'text', q, domain: isDomainName(q) }
}

const KINDS: Record<string, ResultKind> = { account: 'account', jetton: 'jetton', collection: 'collection' }

export function parseResult(i: TonapiSearchItem): SearchResult {
  const m = /^(.*) · (\w+)$/.exec(i.name)
  const title = (m ? m[1]! : i.name).trim()
  return {
    raw: i.address.toLowerCase(),
    title,
    kind: (m && KINDS[m[2]!]) || 'other',
    verified: i.trust === 'whitelist',
    domain: isDomainName(title),
    image: i.preview
  }
}

export interface Grouped {
  /** Reviewed by tonapi: exchanges, services, known tokens. */
  verified: SearchResult[]
  /** Unreviewed .ton / .t.me names, accounts and tokens. Lookalikes of real services live here. */
  unverified: SearchResult[]
}

const KIND_ORDER: Record<ResultKind, number> = { account: 0, jetton: 1, collection: 2, other: 3 }

/**
 * Splits results into verified and unverified, dropping repeats of the same address, and puts the
 * best matches first inside each group: exact title, then prefix, then accounts before tokens.
 */
export function groupResults(items: TonapiSearchItem[], query: string): Grouped {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const all: SearchResult[] = []
  for (const i of items) {
    const r = parseResult(i)
    const key = `${r.raw}|${r.title}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(r)
  }
  const score = (r: SearchResult) => {
    const t = r.title.toLowerCase()
    return t === q ? 0 : t.startsWith(q) ? 1 : 2
  }
  const order = (a: SearchResult, b: SearchResult) => score(a) - score(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  // Array.prototype.sort is stable, so tonapi's own ranking is kept within ties.
  return {
    verified: all.filter(r => r.verified).sort(order),
    unverified: all.filter(r => !r.verified).sort(order)
  }
}

/**
 * Why an unverified result deserves a warning: its name contains the name of a verified result
 * (e.g. "fragment-support.ton" next to the real "Fragment").
 */
export function lookalikeOf(r: SearchResult, verified: SearchResult[]): string | undefined {
  if (r.verified) return undefined
  const t = r.title.toLowerCase().replace(/[^a-z0-9]/g, '')
  return verified.find((v) => {
    const n = v.title.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
    return n.length >= 3 && t.includes(n) && v.raw !== r.raw
  })?.title
}
