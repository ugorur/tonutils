import type { MaybeRefOrGetter } from 'vue'
import type { TonNetwork } from './useTonNetwork'

const HOSTS: Record<TonNetwork, string> = {
  mainnet: 'https://toncenter.com/api',
  testnet: 'https://testnet.toncenter.com/api'
}

type Query = Record<string, string | number | boolean | undefined>

/**
 * Keyless toncenter client (v2 JSON-RPC style GET + v3 indexer), ~1 rps queue with 429 retry.
 * Throws TonApiError. Uses the global network unless one is passed.
 *
 *   const tc = useToncenter()
 *   const balance = await tc.v2<string>('getAddressBalance', { address })
 *   const { accounts } = await tc.v3<{ accounts: unknown[] }>('accountStates', { address })
 */
export function useToncenter(network?: MaybeRefOrGetter<TonNetwork>) {
  const global = useTonNetwork().network
  const base = () => HOSTS[toValue(network) ?? global.value]

  /** v2: returns the unwrapped `result` field. */
  async function v2<T>(method: string, query?: Query): Promise<T> {
    const url = buildUrl(`${base()}/v2`, method, query)
    const res = await rateLimitedJson<{ ok: boolean, result: T, error?: string }>(url, { provider: 'toncenter' })
    if (!res.ok) throw new TonApiError(res.error ?? 'toncenter returned ok: false', 'toncenter', 200, url, res)
    return res.result
  }

  /** v3: returns the JSON body as is. */
  function v3<T>(path: string, query?: Query): Promise<T> {
    return rateLimitedJson<T>(buildUrl(`${base()}/v3`, path, query), { provider: 'toncenter' })
  }

  return { v2, v3, baseUrl: base }
}
