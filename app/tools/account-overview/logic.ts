import type { Holding, TonapiJettonBalance } from '~/lib/accounts/core'
import { isDomainName, toHolding, toRaw } from '~/lib/accounts/core'

export type LookupQuery =
  | { kind: 'empty' }
  | { kind: 'address', raw: string }
  | { kind: 'domain', name: string }
  | { kind: 'invalid', error: string }

/** Address in any form, or a .ton / .t.me name. */
export function classifyQuery(input: string): LookupQuery {
  const q = input.trim()
  if (!q) return { kind: 'empty' }
  if (isDomainName(q)) return { kind: 'domain', name: q.toLowerCase() }
  try {
    return { kind: 'address', raw: toRaw(q) }
  }
  catch {
    if (/\.\w+$/.test(q)) return { kind: 'invalid', error: 'Only .ton and .t.me names can be looked up.' }
    return { kind: 'invalid', error: 'Not a valid TON address or .ton / .t.me name. Check for a typo.' }
  }
}

export interface JettonSummary {
  /** Jettons with a non-zero balance, scam tokens excluded. */
  count: number
  /** Non-zero balances tonapi flags as scam (blacklist). */
  scam: number
  /** Sum of priced holdings verified by tonapi (unverified prices are easy to fake, so they are left out). */
  value: number
  /** Verified holdings first, each group by value. */
  top: Holding[]
  /** tonapi stops at 1000 balances (Binance's wallet hits it), so the counts are lower bounds. */
  capped: boolean
}

/** tonapi /accounts/{id}/jettons returns at most this many balances. */
export const JETTON_PAGE = 1000

export function summarizeJettons(balances: TonapiJettonBalance[], currency: string, topN = 5): JettonSummary {
  const all = balances.filter(b => b.balance !== '0').map(b => toHolding(b, currency))
  const ok = all.filter(h => h.verification !== 'blacklist')
  const verified = (h: Holding) => Number(h.verification === 'whitelist')
  const ranked = [...ok].sort((a, b) => verified(b) - verified(a) || (b.value ?? -1) - (a.value ?? -1))
  return {
    count: ok.length,
    scam: all.length - ok.length,
    value: ok.reduce((s, h) => s + (verified(h) ? h.value ?? 0 : 0), 0),
    top: ranked.slice(0, topN),
    capped: balances.length >= JETTON_PAGE
  }
}

/** "100+" when the count hit the page limit. */
export function countLabel(n: number, limit: number): string {
  return n >= limit ? `${limit - 1}+` : String(n)
}
