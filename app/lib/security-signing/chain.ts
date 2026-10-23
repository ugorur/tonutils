// On-chain public key lookup for resolvePublicKey. Client only (pass the useTonapi() client).
import { TonApiError } from '~/utils/api-client'

/** get_public_key through tonapi; null when the account is not deployed or has no such getter. Rate limits and outages throw. */
export function tonapiKeyLookup(tonapi: { get: <T>(path: string) => Promise<T> }) {
  return async (raw: string): Promise<string | null> => {
    try {
      return (await tonapi.get<{ public_key: string }>(`accounts/${raw}/publickey`)).public_key
    }
    catch (e) {
      if (e instanceof TonApiError && !e.isRateLimit && e.status >= 400 && e.status < 500) return null
      throw e
    }
  }
}
