// Gasless (tonapi "battery"/relayer) jetton transfer estimate. tonapi docs: POST /v2/gasless/estimate/{master_id}
// takes { wallet_address, wallet_public_key, messages: [{ boc }] } where boc is a HEX internal message to the
// sender's jetton wallet (base64 is rejected with error 40007). Only W5 wallets can relay (error 40004 otherwise).
import { Address, beginCell, internal, storeMessageRelaxed } from '@ton/core'
import type { DecodedBody } from '~/utils/ton/messages'
import { decodeBody, jettonTransferBody, parseBoc } from '~/utils/ton/messages'

/** GRAM the jetton wallet message carries in the estimate (what the relayer pays and the commission covers). */
export const ESTIMATE_ATTACH_NANO = 50_000_000n

export interface GaslessConfig {
  relay_address: string
  gas_jettons: { master_id: string }[]
}

export interface GaslessEstimate {
  protocol_name?: string
  relay_address: string
  /** Fee in the jetton's base units. */
  commission: string
  from: string
  valid_until: number
  messages: { address: string, amount: string, payload?: string, state_init?: string }[]
}

/**
 * The message tonapi wants to estimate: an internal message from the sender to their jetton wallet carrying a
 * jetton_transfer whose response_destination is the relayer (it gets the excess). Returned as a hex BOC.
 */
export function estimateMessageHex(p: { jettonWallet: Address, destination: Address, relay: Address, amount: bigint, comment?: string }): string {
  const body = jettonTransferBody({
    amount: p.amount,
    destination: p.destination,
    responseDestination: p.relay,
    forwardTonAmount: 1n,
    forwardPayload: p.comment || null
  })
  const msg = internal({ to: p.jettonWallet, bounce: true, value: ESTIMATE_ATTACH_NANO, body })
  return beginCell().store(storeMessageRelaxed(msg)).endCell().toBoc().toString('hex')
}

export interface EstimateView {
  commission: bigint
  /** amount + commission, in base units. */
  totalJettons: bigint
  validUntil: number
  messages: { address: string, amount: bigint, body: DecodedBody | null, role: 'transfer' | 'fee' | 'other' }[]
}

/** Labels each relayed message: your transfer, or the fee paid to the relayer. */
export function readEstimate(e: GaslessEstimate, amount: bigint, relayRaw: string): EstimateView {
  const commission = BigInt(e.commission)
  return {
    commission,
    totalJettons: amount + commission,
    validUntil: e.valid_until,
    messages: e.messages.map((m) => {
      const body = m.payload ? decodeBody(parseBoc(m.payload)) : null
      const dest = body?.fields.destination
      const toRelay = typeof dest === 'string' && sameAddress(dest, relayRaw)
      const role = body?.name === 'jetton_transfer' ? (toRelay ? 'fee' : 'transfer') : 'other'
      return { address: m.address, amount: BigInt(m.amount), body, role }
    })
  }
}

function sameAddress(a: string, b: string): boolean {
  try {
    return Address.parse(a).equals(Address.parse(b))
  }
  catch {
    return false
  }
}

/** Friendly reasons for the tonapi gasless error codes we have seen. */
export function explainGaslessError(body: unknown): string | null {
  const b = body as { error?: string, error_code?: number } | null
  if (!b?.error) return null
  if (b.error_code === 40004 || /wallet version/i.test(b.error)) return 'Gasless transfers need a W5 (v5r1) wallet. This address uses an older wallet version, so the relayer cannot send for it.'
  if (/insufficient|not enough|balance/i.test(b.error)) return `Not enough jettons to cover the transfer plus the relayer fee (${b.error}).`
  return null
}
