// Payload decoder: local decoding lives in ~/lib/payloads/decode (shared with the W5 builder).
// This file adds the transaction-hash path (toncenter v3 /transactions) as pure functions.
import type { DecodedBody, DecodeOptions } from '~/lib/payloads/decode'
import { Address } from '@ton/core'
import { decodePayload } from '~/lib/payloads/decode'

export { analyzeInput, decodePayload, flatten, plain } from '~/lib/payloads/decode'

export interface V3Message {
  hash: string
  source: string | null
  destination: string | null
  value: string | null
  bounced: boolean | null
  message_content: { body: string, decoded?: unknown } | null
}

export interface V3Transaction {
  hash: string
  account: string
  now: number
  lt: string
  in_msg: V3Message | null
  out_msgs: V3Message[]
}

export interface TxMessageView {
  direction: 'in' | 'out'
  from: string | null
  to: string | null
  value: bigint | null
  bounced: boolean
  body: DecodedBody
}

const friendly = (raw: string | null, o: DecodeOptions) => {
  if (!raw) return null
  try {
    return Address.parseRaw(raw).toString({ testOnly: o.testOnly })
  }
  catch {
    return raw
  }
}

/** Every message of a toncenter v3 transaction (inbound first), with decoded bodies. */
export function txMessages(tx: V3Transaction, o: DecodeOptions = {}): TxMessageView[] {
  const list: [V3Message, 'in' | 'out'][] = [
    ...(tx.in_msg ? [[tx.in_msg, 'in'] as [V3Message, 'in']] : []),
    ...tx.out_msgs.map(m => [m, 'out'] as [V3Message, 'out'])
  ]
  return list.map(([m, direction]) => ({
    direction,
    from: friendly(m.source, o),
    to: friendly(m.destination, o),
    value: m.value === null ? null : BigInt(m.value),
    bounced: !!m.bounced,
    body: m.message_content?.body ? decodePayload(m.message_content.body, o) : { op: null, opHex: null, name: 'empty', title: 'Empty body', fields: {} }
  }))
}
