import type { MaybeRefOrGetter } from 'vue'
import type { TonNetwork } from './useTonNetwork'

const HOSTS: Record<TonNetwork, string> = {
  mainnet: 'https://tonapi.io/v2',
  testnet: 'https://testnet.tonapi.io/v2'
}

/**
 * Keyless tonapi.io v2 client with the same queue/retry as useToncenter. Throws TonApiError.
 *
 *   const api = useTonapi()
 *   const account = await api.get<{ balance: number }>(`accounts/${address}`)
 */
export function useTonapi(network?: MaybeRefOrGetter<TonNetwork>) {
  const global = useTonNetwork().network
  const base = () => HOSTS[toValue(network) ?? global.value]

  function get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return rateLimitedJson<T>(buildUrl(base(), path, query), { provider: 'tonapi' })
  }

  /** POST with a JSON body (e.g. `accounts/_bulk`). */
  function post<T>(path: string, body: unknown): Promise<T> {
    return rateLimitedJson<T>(buildUrl(base(), path), { provider: 'tonapi' }, jsonPost(body))
  }

  return { get, post, baseUrl: base }
}
