// Browser-only watchlist storage shared by the watchlist and portfolio tools. One list per network.
// Only public addresses and the user's own labels are stored, in this browser's localStorage.

export interface WatchItem {
  /** Lowercase raw address. */
  raw: string
  label: string
  addedAt: number
  /** Balance (nanoGRAM, decimal string) at the previous refresh, to show what changed since. */
  lastBalance?: string
  lastCheckedAt?: number
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const key = (network: string) => `tonutils:watchlist:${network}`
const MAX_ITEMS = 200

function store(): Store | null {
  try {
    return globalThis.localStorage ?? null
  }
  catch {
    return null
  }
}

export function loadWatchlist(network: string, s: Store | null = store()): WatchItem[] {
  try {
    const v = JSON.parse(s?.getItem(key(network)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is WatchItem => typeof x?.raw === 'string' && /^-?\d+:[0-9a-f]{64}$/.test(x.raw)).map(x => ({ ...x, label: String(x.label ?? '') })) : []
  }
  catch {
    return []
  }
}

export function saveWatchlist(network: string, items: WatchItem[], s: Store | null = store()): void {
  try {
    s?.setItem(key(network), JSON.stringify(items.slice(0, MAX_ITEMS)))
  }
  catch { /* storage full or blocked: the list just won't persist */ }
}

/** Adds new addresses (skips ones already listed), keeping order. Returns the new list and how many were added. */
export function addToWatchlist(items: WatchItem[], add: { raw: string, label: string }[], now = Date.now()): { items: WatchItem[], added: number } {
  const have = new Set(items.map(i => i.raw))
  const fresh: WatchItem[] = []
  for (const a of add) {
    if (have.has(a.raw)) continue
    have.add(a.raw)
    fresh.push({ raw: a.raw, label: a.label.slice(0, 80), addedAt: now })
  }
  return { items: [...items, ...fresh].slice(0, MAX_ITEMS), added: fresh.length }
}

export const WATCHLIST_MAX = MAX_ITEMS
