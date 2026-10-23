import type { AccountState } from '~/lib/accounts/core'
import type { WatchItem } from '~/lib/accounts/watchlist'

export interface WatchRow {
  item: WatchItem
  state?: AccountState
  /** Balance change since the baseline (the last refresh of an earlier visit); undefined when unknown or unchanged. */
  delta?: bigint
  /** When the baseline balance was seen (ms). */
  since?: number
}

export type Baseline = Map<string, { balance: bigint, at: number }>

/** What was stored at page load: the balance each item had at its last refresh. */
export function baselineOf(items: WatchItem[]): Baseline {
  const out: Baseline = new Map()
  for (const i of items) {
    if (i.lastBalance === undefined || !/^\d+$/.test(i.lastBalance)) continue
    out.set(i.raw, { balance: BigInt(i.lastBalance), at: i.lastCheckedAt ?? 0 })
  }
  return out
}

export function buildRows(items: WatchItem[], states: Map<string, AccountState>, baseline: Baseline): WatchRow[] {
  return items.map((item) => {
    const state = states.get(item.raw)
    const base = baseline.get(item.raw)
    const delta = state && base ? state.balance - base.balance : undefined
    return { item, state, delta: delta ? delta : undefined, since: base?.at }
  })
}

/** Items with the freshly seen balances stored, so the next visit can show what changed. */
export function withSnapshot(items: WatchItem[], states: Map<string, AccountState>, now = Date.now()): WatchItem[] {
  return items.map((i) => {
    const s = states.get(i.raw)
    return s ? { ...i, lastBalance: s.balance.toString(), lastCheckedAt: now } : i
  })
}

export function totalBalance(rows: WatchRow[]): bigint {
  return rows.reduce((s, r) => s + (r.state?.balance ?? 0n), 0n)
}

export type SortKey = 'added' | 'label' | 'balance' | 'activity'

export function sortRows(rows: WatchRow[], key: SortKey): WatchRow[] {
  if (key === 'added') return rows
  const out = [...rows]
  if (key === 'label') return out.sort((a, b) => (a.item.label || '\uffff').localeCompare(b.item.label || '\uffff'))
  if (key === 'balance') {
    const k = (r: WatchRow) => r.state?.balance ?? -1n
    return out.sort((a, b) => (k(b) > k(a) ? 1 : k(b) < k(a) ? -1 : 0))
  }
  return out.sort((a, b) => (b.state?.lastActivity ?? 0) - (a.state?.lastActivity ?? 0))
}
