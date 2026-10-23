import type { TonapiAccountRef } from '~/lib/jettons-read/core'
import { sameAddress } from '~/lib/jettons-read/core'

/** tonapi GET /v2/accounts/{owner}/jettons/{master}/history event (fields we use). */
export interface TonapiJettonEvent {
  event_id: string
  timestamp: number
  lt: number
  in_progress?: boolean
  is_scam?: boolean
  actions: TonapiAction[]
}

interface JettonRef { address: string, symbol?: string, decimals?: number }

export interface TonapiAction {
  type: string
  status: 'ok' | 'failed' | string
  base_transactions?: string[]
  JettonTransfer?: { sender?: TonapiAccountRef, recipient?: TonapiAccountRef, amount: string, comment?: string, encrypted_comment?: unknown, jetton: JettonRef }
  JettonMint?: { recipient: TonapiAccountRef, amount: string, jetton: JettonRef }
  JettonBurn?: { sender: TonapiAccountRef, amount: string, jetton: JettonRef }
  JettonSwap?: { dex?: string, amount_in: string, amount_out: string, user_wallet: TonapiAccountRef, jetton_master_in?: JettonRef, jetton_master_out?: JettonRef }
}

export type Direction = 'in' | 'out' | 'self' | 'mint' | 'burn' | 'swap-in' | 'swap-out'

export const DIRECTION_LABELS: Record<Direction, string> = {
  'in': 'Received',
  'out': 'Sent',
  'self': 'To self',
  'mint': 'Minted',
  'burn': 'Burned',
  'swap-in': 'Bought (swap)',
  'swap-out': 'Sold (swap)'
}

export interface HistoryRow {
  /** eventId + action index: unique per row. */
  key: string
  eventId: string
  /** Hash for explorer links: the first transaction of the action, else the event (trace) id. */
  txHash: string
  time: number
  lt: number
  direction: Direction
  failed: boolean
  pending: boolean
  /** Base units, always positive; the sign comes from `direction`. */
  amount: bigint
  counterparty?: TonapiAccountRef
  comment?: string
  encrypted: boolean
  scam: boolean
}

/** One row per action of this jetton in each event, from the owner's point of view. */
export function historyRows(events: TonapiJettonEvent[], owner: string, masterRaw: string): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (const e of events) {
    e.actions.forEach((a, i) => {
      const base = {
        key: `${e.event_id}:${i}`,
        eventId: e.event_id,
        txHash: a.base_transactions?.[0] ?? e.event_id,
        time: e.timestamp,
        lt: e.lt,
        failed: a.status !== 'ok',
        pending: !!e.in_progress,
        encrypted: false,
        scam: !!e.is_scam
      }
      const t = a.JettonTransfer
      if (t && sameAddress(t.jetton.address, masterRaw)) {
        const out = sameAddress(t.sender?.address, owner)
        const inn = sameAddress(t.recipient?.address, owner)
        if (!out && !inn) return
        rows.push({ ...base, direction: out && inn ? 'self' : out ? 'out' : 'in', amount: BigInt(t.amount), counterparty: out ? t.recipient : t.sender, comment: t.comment, encrypted: !!t.encrypted_comment })
        return
      }
      const m = a.JettonMint
      if (m && sameAddress(m.jetton.address, masterRaw) && sameAddress(m.recipient.address, owner)) {
        rows.push({ ...base, direction: 'mint', amount: BigInt(m.amount) })
        return
      }
      const b = a.JettonBurn
      if (b && sameAddress(b.jetton.address, masterRaw) && sameAddress(b.sender.address, owner)) {
        rows.push({ ...base, direction: 'burn', amount: BigInt(b.amount) })
        return
      }
      const s = a.JettonSwap
      if (s && sameAddress(s.user_wallet.address, owner)) {
        if (sameAddress(s.jetton_master_out?.address, masterRaw)) rows.push({ ...base, direction: 'swap-in', amount: BigInt(s.amount_out), counterparty: undefined, comment: s.dex ? `via ${s.dex}` : undefined })
        else if (sameAddress(s.jetton_master_in?.address, masterRaw)) rows.push({ ...base, direction: 'swap-out', amount: BigInt(s.amount_in), comment: s.dex ? `via ${s.dex}` : undefined })
      }
    })
  }
  return rows
}

export type Filter = 'all' | 'in' | 'out' | 'burn' | 'failed'

export function filterRows(rows: HistoryRow[], f: Filter): HistoryRow[] {
  switch (f) {
    case 'in': return rows.filter(r => !r.failed && (r.direction === 'in' || r.direction === 'mint' || r.direction === 'swap-in'))
    case 'out': return rows.filter(r => !r.failed && (r.direction === 'out' || r.direction === 'swap-out' || r.direction === 'burn'))
    case 'burn': return rows.filter(r => r.direction === 'burn')
    case 'failed': return rows.filter(r => r.failed)
    default: return rows
  }
}

/** Net change of the successful rows (received − sent), base units. */
export function netChange(rows: HistoryRow[]): { received: bigint, sent: bigint } {
  let received = 0n
  let sent = 0n
  for (const r of rows) {
    if (r.failed || r.direction === 'self') continue
    if (r.direction === 'in' || r.direction === 'mint' || r.direction === 'swap-in') received += r.amount
    else sent += r.amount
  }
  return { received, sent }
}
