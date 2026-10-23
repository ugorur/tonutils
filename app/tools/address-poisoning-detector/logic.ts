// Address poisoning detector: the detection itself lives in ~/lib/security/core (the wallet checkup reuses it).
import { Address } from '@ton/core'
import type { PoisonReport, VisibleMatch } from '~/lib/security/core'

export { detectPoisoning, fetchEvents } from '~/lib/security/core'

export const EXAMPLE = 'UQA1eUxtUXQM0J3E53ydRKcCJIJWOI2prdCKY6UguqGeekpE'
export const DEPTHS = [100, 300, 1000] as const

export interface Segment { text: string, hit: boolean }

/** Splits an address (in the form that matched) into matching / differing parts for highlighting. */
export function highlight(raw: string, m: Pick<VisibleMatch, 'bounceable' | 'prefix' | 'suffix'>, testnet = false): Segment[] {
  const s = Address.parse(raw).toString({ bounceable: m.bounceable, testOnly: testnet, urlSafe: true })
  const head = 2 + m.prefix
  const tail = s.length - m.suffix
  return [
    { text: s.slice(0, head), hit: true },
    { text: s.slice(head, tail), hit: false },
    { text: s.slice(tail), hit: true }
  ].filter(x => x.text)
}

export type Verdict = 'poisoned' | 'spam' | 'clean' | 'empty'

export function verdict(r: PoisonReport): Verdict {
  if (!r.events) return 'empty'
  if (r.groups.length) return 'poisoned'
  return r.junkSenders.length ? 'spam' : 'clean'
}

export function fakeCount(r: PoisonReport): number {
  return r.groups.reduce((n, g) => n + g.fakes.length, 0)
}
