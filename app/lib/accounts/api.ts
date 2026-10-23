// Network calls shared by the accounts tools. Everything goes through the shared rate-limited clients
// (one queue per host, ~1 req/s, retry on 429), so toncenter and tonapi batches run side by side.
import type { Ref } from 'vue'
import { useTonapi } from '~/composables/useTonapi'
import { useToncenter } from '~/composables/useToncenter'
import { type TonNetwork, useTonNetwork } from '~/composables/useTonNetwork'
import type { AccountState, Rate, TonapiAccount, TonapiPrice, ToncenterWalletStates } from './core'
import { mergeStates, pickRate } from './core'

type Query = Record<string, string | number | boolean | undefined>

export interface AccountClients {
  /** toncenter v3; `path` may carry its own query string for repeated params. */
  v3: <T>(path: string, query?: Query) => Promise<T>
  tonapi: <T>(path: string, query?: Query) => Promise<T>
  tonapiPost: <T>(path: string, body: unknown) => Promise<T>
}

/**
 * Clients bound to the site network (read on every call). Call from Tool.vue setup and pass the tool's own
 * `useTonNetwork().network`: each useCookie ref syncs with the others asynchronously, so a `watch(network)`
 * handler would otherwise still hit the previous network's API.
 */
export function useAccountClients(network: Ref<TonNetwork> = useTonNetwork().network): AccountClients {
  const tc = useToncenter(network)
  const ta = useTonapi(network)
  return {
    v3: tc.v3,
    tonapi: ta.get,
    tonapiPost: ta.post
  }
}

/** Both APIs accept up to 100 accounts per call (toncenter via ~7 KB of query string, tonapi /_bulk hard limit). */
export const BATCH = 100

export function chunk<T>(xs: T[], n = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export interface StatesResult {
  states: Map<string, AccountState>
  /** tonapi failed for some batch: names, scam flags and last activity are missing there. */
  extrasError?: unknown
}

/**
 * Exact balances, status and wallet type (toncenter walletStates) plus name, scam flag and last activity
 * (tonapi _bulk) for any number of raw addresses, 100 per request.
 */
export async function fetchAccountStates(raws: string[], c: AccountClients, onProgress?: (done: number, total: number) => void): Promise<StatesResult> {
  const states = new Map<string, AccountState>()
  let extrasError: unknown
  let done = 0
  onProgress?.(0, raws.length)
  for (const batch of chunk([...new Set(raws)])) {
    const qs = batch.map(a => `address=${encodeURIComponent(a)}`).join('&')
    const [tc, ta] = await Promise.all([
      c.v3<ToncenterWalletStates>(`walletStates?${qs}`),
      c.tonapiPost<{ accounts: TonapiAccount[] }>('accounts/_bulk', { account_ids: batch }).then(r => r.accounts, (e) => {
        extrasError = e
        return null
      })
    ])
    for (const s of mergeStates(batch, tc, ta)) states.set(s.raw, s)
    done += batch.length
    onProgress?.(done, raws.length)
  }
  return { states, extrasError }
}

/** Resolves a .ton / .t.me name to the wallet it points to (lowercase raw), via tonapi DNS. */
export async function resolveName(name: string, c: AccountClients): Promise<string> {
  try {
    const r = await c.tonapi<{ wallet?: { address?: string } }>(`dns/${encodeURIComponent(name.toLowerCase())}/resolve`)
    if (r.wallet?.address) return r.wallet.address.toLowerCase()
  }
  catch (e) {
    const status = (e as { status?: number }).status
    if (status !== 404) throw e
  }
  throw new Error(`${name} does not point to a wallet (not registered, expired, or no wallet record set)`)
}

/** Price of GRAM (tonapi token id "ton") and optional jettons in one fiat currency. */
export async function fetchRates(currency: string, c: AccountClients, tokens: string[] = ['ton']): Promise<Record<string, Rate>> {
  const cur = currency.toUpperCase()
  const r = await c.tonapi<{ rates: Record<string, TonapiPrice> }>('rates', { tokens: tokens.join(','), currencies: cur.toLowerCase() })
  const out: Record<string, Rate> = {}
  for (const [k, v] of Object.entries(r.rates ?? {})) {
    const rate = pickRate(v, cur)
    if (rate) out[k.toLowerCase()] = rate
  }
  return out
}
