import { formatAmount } from '~/utils/units'
import { COIN_SYMBOL } from '~/utils/currency'
import type { ActionView, Asset, TaAccount, TaEvent } from '~/lib/tx-user/events'
import { describeAction, friendlyAddress, viewerFee } from '~/lib/tx-user/events'

const PAYMENT_TYPES = new Set(['TonTransfer', 'JettonTransfer', 'ExtraCurrencyTransfer', 'Purchase', 'NftItemTransfer', 'NftPurchase'])

export interface ReceiptLine {
  view: ActionView
  /** Transferred amount and asset; absent for NFT transfers. */
  value?: { asset: Asset, amount: bigint }
}

export interface Receipt {
  eventId: string
  time: number
  status: 'confirmed' | 'pending' | 'failed'
  payer?: TaAccount
  lines: ReceiptLine[]
  extMsgHash?: string
}

/**
 * Picks the payment(s) out of a tonapi event: transfers sent by the account that sent the first one.
 * Refunds and excess returns (sent by other accounts) are left out. Returns null for non-payments.
 */
export function buildReceipt(ev: TaEvent): Receipt | null {
  const views = ev.actions.filter(a => PAYMENT_TYPES.has(a.type)).map(a => describeAction(a))
  const payer = views[0]?.from
  if (!payer) return null
  const mine = views.filter(v => v.from?.address === payer.address)
  const lines = mine.map(v => ({ view: v, value: v.value }))
  return {
    eventId: ev.event_id,
    time: ev.timestamp,
    status: ev.in_progress ? 'pending' : mine.every(v => v.ok) ? 'confirmed' : 'failed',
    payer,
    lines,
    extMsgHash: ev.ext_msg_hash
  }
}

/** Fee the payer paid, from its account-scoped tonapi event (bounced refunds netted, see viewerFee). */
export function feeFromAccountEvent(ev: Pick<TaEvent, 'extra' | 'actions'>, payer: string): bigint {
  return viewerFee(ev, ev.actions.map(a => describeAction(a, payer)), payer).fee
}

export function utcTime(time: number): string {
  return new Date(time * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

export interface ReceiptExtras {
  fee?: bigint
  fiat?: { currency: string, value: number, date: string } | null
  explorer: string
  testOnly: boolean
}

/** Plain-text receipt for pasting into a support ticket or chat. */
export function receiptText(r: Receipt, x: ReceiptExtras): string {
  const addr = (a?: TaAccount) => (a ? friendlyAddress(a.address, a.is_wallet ?? true, x.testOnly) + (a.name ? ` (${a.name})` : '') : '—')
  const lines = [
    `Payment receipt (TON network)`,
    `Status: ${r.status === 'confirmed' ? 'Confirmed' : r.status === 'pending' ? 'Pending' : 'Failed'}`,
    `Date: ${utcTime(r.time)}`,
    `From: ${addr(r.payer)}`
  ]
  for (const l of r.lines) {
    const amt = l.value ? `${formatAmount(l.value.amount, l.value.asset.decimals)} ${l.value.asset.symbol}` : l.view.title
    lines.push(`To: ${addr(l.view.to)}`, `Amount: ${amt}`)
    // Fake USD₮ copies use the same symbol: the master address is the only thing that tells them apart.
    if (l.value?.asset.master) lines.push(`Token contract: ${friendlyAddress(l.value.asset.master, false, x.testOnly)}${l.value.asset.verification === 'whitelist' ? '' : ' (unverified token)'}`)
    if (l.view.comment) lines.push(`Comment: ${l.view.comment}`)
    if (l.view.encrypted) lines.push('Comment: (encrypted)')
  }
  if (x.fee !== undefined) lines.push(`Network fee: ${formatAmount(x.fee, 9)} ${COIN_SYMBOL}`)
  if (x.fiat) lines.push(`Value: ≈ ${x.fiat.value.toFixed(2)} ${x.fiat.currency} (rate of ${x.fiat.date})`)
  lines.push(`Transaction: ${r.eventId}`, `Verify: ${x.explorer}`)
  return lines.join('\n')
}
