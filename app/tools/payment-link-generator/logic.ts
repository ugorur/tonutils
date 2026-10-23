// Payment link generation: draft -> validated request -> every link form. The formats live in ~/lib/payments/link.
import type { DraftOptions, DraftResult, PaymentDraft } from '~/lib/payments/form'
import { draftToRequest } from '~/lib/payments/form'
import type { LinkKind } from '~/lib/payments/link'
import { buildLink, supportedKinds } from '~/lib/payments/link'

export { buildLink, supportedKinds }

export interface Generated extends DraftResult {
  links: { kind: LinkKind, url: string }[]
}

export function generate(draft: PaymentDraft, opts: DraftOptions = {}): Generated {
  const r = draftToRequest(draft, opts)
  return { ...r, links: r.request ? supportedKinds(r.request).map(kind => ({ kind, url: buildLink(r.request!, kind) })) : [] }
}

/** File name for QR downloads: "pay-UQDYzZ-5-GRAM". */
export function qrFilename(to: string, amount: string, symbol: string): string {
  return ['pay', to.slice(0, 6), amount.trim(), amount.trim() ? symbol : ''].filter(Boolean).join('-').replace(/[^\w.-]+/g, '')
}
