import type { ActionKind, ActionView, Asset, TaEvent } from '~/lib/tx-user/events'
import { assetKey, describeAction, viewerFee } from '~/lib/tx-user/events'

export const PAGE_SIZE = 50

export interface HistoryItem {
  id: string
  time: number
  inProgress: boolean
  ok: boolean
  spam: boolean
  actions: ActionView[]
  /** nanoGRAM this account paid in fees for the event (0 when it paid none). */
  fee: bigint
  /** nanoGRAM credited beyond the listed actions (rare; e.g. excess returned). */
  otherIn: bigint
}

export function toHistoryItem(ev: TaEvent, viewer: string): HistoryItem {
  const actions = ev.actions.map(a => describeAction(a, viewer))
  const { fee, otherIn } = viewerFee(ev, actions, viewer)
  return {
    id: ev.event_id,
    time: ev.timestamp,
    inProgress: ev.in_progress,
    ok: actions.every(a => a.ok),
    spam: !!ev.is_scam || actions.some(a => a.spam),
    actions,
    fee,
    otherIn
  }
}

export type KindFilter = 'all' | ActionKind | 'failed'

export const KIND_FILTERS: { value: KindFilter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'send', label: 'Sent' },
  { value: 'receive', label: 'Received' },
  { value: 'swap', label: 'Swaps' },
  { value: 'nft', label: 'NFTs' },
  { value: 'stake', label: 'Staking' },
  { value: 'contract', label: 'Contract calls' },
  { value: 'failed', label: 'Failed' }
]

export interface HistoryFilter {
  kind: KindFilter
  /** assetKey() of a token, or 'all'. */
  asset: string
  hideSpam: boolean
}

export function matches(item: HistoryItem, f: HistoryFilter): boolean {
  if (f.hideSpam && item.spam) return false
  if (f.kind === 'failed' && item.ok) return false
  if (f.kind !== 'all' && f.kind !== 'failed' && !item.actions.some(a => a.kind === f.kind)) return false
  if (f.asset !== 'all' && !item.actions.some(a => a.flows.some(fl => assetKey(fl.asset) === f.asset))) return false
  return true
}

/** Tokens that appear in the loaded history, most frequent first, for the token filter. */
export function tokenOptions(items: HistoryItem[], hideSpam: boolean): { value: string, label: string, asset: Asset }[] {
  const count = new Map<string, { asset: Asset, n: number }>()
  for (const it of items) {
    if (hideSpam && it.spam) continue
    for (const a of it.actions) {
      for (const fl of a.flows) {
        const k = assetKey(fl.asset)
        const c = count.get(k) ?? { asset: fl.asset, n: 0 }
        c.n++
        count.set(k, c)
      }
    }
  }
  return [...count.entries()].sort((a, b) => b[1].n - a[1].n).map(([value, { asset }]) => ({ value, label: asset.symbol, asset }))
}

/** "Today", "Yesterday" or a local date, for grouping the list. */
export function dayLabel(time: number, now = new Date()): string {
  const d = new Date(time * 1000)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function groupByDay(items: HistoryItem[], now = new Date()): { day: string, items: HistoryItem[] }[] {
  const groups: { day: string, items: HistoryItem[] }[] = []
  for (const it of items) {
    const day = dayLabel(it.time, now)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(it)
    else groups.push({ day, items: [it] })
  }
  return groups
}
