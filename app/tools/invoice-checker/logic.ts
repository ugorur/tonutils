// Invoice watching: match tonapi account events to a payment request (~/lib/payments/match) and describe the result.
import { Address } from '@ton/core'
import type { InvoiceState, Payment, TonapiEvent } from '~/lib/payments/match'
import type { PaymentRequest } from '~/lib/payments/link'

export { findPayments, invoiceState, mergeEvents, specFor } from '~/lib/payments/match'
export type { InvoiceSpec, InvoiceState, Payment, TonapiEvent } from '~/lib/payments/match'

/**
 * A real, already settled payment to `to` from a tonapi events page (the "watch a live example" button):
 * the newest completed incoming coin transfer with a comment, as a request plus the `since` that includes it.
 */
export function exampleFromEvents(events: readonly TonapiEvent[], to: string): { request: PaymentRequest, since: number } | null {
  const me = Address.parse(to)
  const incoming = (r?: string) => {
    try {
      return !!r && Address.parse(r).equals(me)
    }
    catch {
      return false
    }
  }
  for (const e of events) {
    if (e.in_progress) continue
    const a = e.actions.find(x => x.type === 'TonTransfer' && x.status === 'ok' && x.TonTransfer?.comment?.trim() && incoming(x.TonTransfer.recipient.address))
    if (a?.TonTransfer) return { request: { to, amount: BigInt(a.TonTransfer.amount), text: a.TonTransfer.comment }, since: e.timestamp - 60 }
  }
  return null
}

/** How much is still missing (underpaid) or was paid on top (overpaid); null when there is no expected amount. */
export function difference(state: InvoiceState, expected?: bigint): bigint | null {
  return expected === undefined || !state.payments.length ? null : state.total - expected
}

/** CSV-ready receipt rows. */
export function receiptRows(payments: readonly Payment[], format: (n: bigint) => string) {
  return payments.map(p => ({
    time: new Date(p.timestamp * 1000).toISOString(),
    sender: p.sender ?? '',
    amount: format(p.amount),
    comment: p.comment,
    event_id: p.eventId,
    status: p.inProgress ? 'in progress' : 'final'
  }))
}
