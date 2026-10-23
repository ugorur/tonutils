// Decodes a payment link: parse (~/lib/payments/link), then explain the body, expiry and network.
import type { ParseResult, PaymentRequest } from '~/lib/payments/link'
import { parsePaymentLink, secondsLeft } from '~/lib/payments/link'
import type { DecodedBody } from '~/utils/ton/messages'
import { decodeBody } from '~/utils/ton/messages'

export { parsePaymentLink }

export type ExpiryState = { kind: 'none' } | { kind: 'valid' | 'expired', at: Date, seconds: number }

export function expiryState(exp: number | undefined, now = Date.now() / 1000): ExpiryState {
  const s = secondsLeft(exp, now)
  if (s === null) return { kind: 'none' }
  return { kind: s > 0 ? 'valid' : 'expired', at: new Date(exp! * 1000), seconds: s }
}

/** The body the wallet would attach: decoded bin, or null (plain transfer / text comment). */
export function decodedBin(r: PaymentRequest, testnet = false): DecodedBody | null {
  return r.bin ? decodeBody(r.bin, { testOnly: testnet }) : null
}

/** First thing in the text that looks like a payment link (QR payloads and pasted messages carry extra text). */
export function extractLink(text: string): string {
  const m = /(?:ton|keeper|tonkeeper|tonhub):\/\/\S+|https?:\/\/\S+/i.exec(text)
  return (m ? m[0] : text).trim()
}

export function decode(input: string): ParseResult {
  return parsePaymentLink(extractLink(input))
}
