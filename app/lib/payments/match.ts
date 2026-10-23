// Finds the payment for an invoice in tonapi /v2/accounts/{id}/events: TonTransfer / JettonTransfer actions
// to the recipient, matched by comment (and amount). Imports @ton/core.
import { Address } from '@ton/core'
import type { PaymentRequest } from './link'

interface TonapiAccountRef { address: string, name?: string, is_scam?: boolean }

export interface TonapiAction {
  type: string
  status: string
  TonTransfer?: { sender: TonapiAccountRef, recipient: TonapiAccountRef, amount: number | string, comment?: string }
  JettonTransfer?: {
    sender?: TonapiAccountRef
    recipient?: TonapiAccountRef
    amount: string
    comment?: string
    jetton: { address: string, symbol?: string, decimals?: number, verification?: string }
  }
}

export interface TonapiEvent {
  event_id: string
  timestamp: number
  actions: TonapiAction[]
  in_progress: boolean
  lt: number
}

export interface InvoiceSpec {
  /** Recipient (any form). */
  to: string
  /** Jetton master (any form); undefined = GRAM. */
  jetton?: string
  /** Expected base units; undefined = any amount. */
  amount?: bigint
  /** Comment to match exactly (after trimming). */
  text?: string
  /** Ignore events before this unix time. */
  since?: number
}

export interface Payment {
  eventId: string
  timestamp: number
  sender: string | null
  senderName?: string
  amount: bigint
  comment: string
  inProgress: boolean
}

export type InvoiceStatus = 'waiting' | 'pending' | 'paid' | 'overpaid' | 'underpaid'

export interface InvoiceState {
  status: InvoiceStatus
  payments: Payment[]
  /** Sum of matched payments. */
  total: bigint
}

const same = (a: string | undefined, b: Address) => {
  if (!a) return false
  try {
    return Address.parse(a).equals(b)
  }
  catch {
    return false
  }
}

/** Matching incoming payments, oldest first. Without `text`, only exact-amount payments count. */
export function findPayments(events: readonly TonapiEvent[], inv: InvoiceSpec): Payment[] {
  const to = Address.parse(inv.to)
  const master = inv.jetton ? Address.parse(inv.jetton) : null
  const text = inv.text?.trim()
  const out: Payment[] = []
  for (const e of events) {
    if (inv.since !== undefined && e.timestamp < inv.since) continue
    for (const a of e.actions) {
      if (a.status !== 'ok') continue
      let t: { sender?: TonapiAccountRef, recipient?: TonapiAccountRef, amount: number | string, comment?: string } | undefined
      if (!master && a.type === 'TonTransfer') t = a.TonTransfer
      else if (master && a.type === 'JettonTransfer' && same(a.JettonTransfer?.jetton.address, master)) t = a.JettonTransfer
      if (!t || !same(t.recipient?.address, to)) continue
      // tonapi sends GRAM amounts as JSON numbers: exact below 2^53 nano (~9 million GRAM).
      const amount = BigInt(t.amount)
      const comment = (t.comment ?? '').trim()
      if (text ? comment !== text : inv.amount === undefined || amount !== inv.amount) continue
      out.push({ eventId: e.event_id, timestamp: e.timestamp, sender: t.sender?.address ?? null, senderName: t.sender?.name, amount, comment, inProgress: e.in_progress })
    }
  }
  return out.sort((x, y) => x.timestamp - y.timestamp)
}

export function invoiceState(payments: Payment[], expected?: bigint): InvoiceState {
  const total = payments.reduce((s, p) => s + p.amount, 0n)
  let status: InvoiceStatus
  if (!payments.length) status = 'waiting'
  else if (payments.some(p => p.inProgress)) status = 'pending'
  else if (expected === undefined || total === expected) status = 'paid'
  else status = total > expected ? 'overpaid' : 'underpaid'
  return { status, payments, total }
}

/** Merges new events into a list, unique by event_id (polls overlap), newest first. */
export function mergeEvents(prev: readonly TonapiEvent[], next: readonly TonapiEvent[]): TonapiEvent[] {
  const m = new Map(prev.map(e => [e.event_id, e]))
  for (const e of next) m.set(e.event_id, e)
  return [...m.values()].sort((a, b) => b.lt - a.lt)
}

/**
 * What to watch for a payment request: its comment, else its exact amount. null when a payment cannot be told
 * apart from others (no comment and no amount) or carries a binary body (tonapi shows no comment for it).
 */
export function specFor(r: PaymentRequest, since?: number): InvoiceSpec | null {
  if (r.bin || (!r.text?.trim() && r.amount === undefined)) return null
  return { to: r.to, jetton: r.jetton, amount: r.amount, text: r.text, since }
}
