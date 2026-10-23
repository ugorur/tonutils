import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { RENEW_AMOUNT, renewBody } from '~/lib/dns-write/dns'

export type ExpiryLevel = 'expired' | 'soon' | 'ok'
/** Within this many days counts as "expiring soon" and is preselected. */
export const SOON_DAYS = 60

export function expiryLevel(expiresAt: number, now: number): ExpiryLevel {
  if (expiresAt < now) return 'expired'
  return expiresAt - now < SOON_DAYS * 86_400 ? 'soon' : 'ok'
}

/** One renew message per item (bounceable: a non-owner gets the value bounced back). */
export function renewMessages(items: string[], testOnly: boolean, queryId = 0n): TonConnectMessage[] {
  const payload = renewBody(queryId)
  return items.map(a => ({ address: Address.parse(a).toString({ bounceable: true, testOnly, urlSafe: true }), amount: RENEW_AMOUNT, payload }))
}

/** Splits into wallet-sized transactions. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
