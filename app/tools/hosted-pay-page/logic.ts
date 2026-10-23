// Checkout page: the TonConnect message that pays a payment request, and why it cannot be paid yet.
import { Address, Cell } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { PaymentRequest } from '~/lib/payments/link'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { commentBody, jettonTransferBody } from '~/utils/ton/messages'

/** nanoGRAM forwarded with transfer_notification so wallets, explorers and the watcher see the comment. */
export const FORWARD_TON = 1n

export interface PayParams {
  /** Base units of the request's asset (the link's amount, or what the payer typed). */
  amount: bigint
  /** The connected wallet (receives the unused jetton gas back; required for jettons). */
  payer?: Address | null
  /** The payer's jetton wallet for the request's jetton (tonapi /accounts/{payer}/jettons/{master}). */
  jettonWallet?: string
  queryId?: bigint
}

const fromB64url = (s: string) => Cell.fromBase64(s.replace(/-/g, '+').replace(/_/g, '/'))

/**
 * The single message the wallet signs. Coin: straight to the recipient (keeps the link's bounce flag) with the
 * comment or binary body. Jetton: TEP-74 transfer to the payer's own jetton wallet, comment as forward payload.
 */
export function paymentMessage(r: PaymentRequest, p: PayParams): TonConnectMessage {
  if (r.jetton) {
    if (!p.jettonWallet || !p.payer) throw new Error('Connect a wallet first: a token payment is sent through your own jetton wallet.')
    return {
      address: p.jettonWallet,
      amount: TOKEN_GAS,
      payload: jettonTransferBody({
        queryId: p.queryId ?? 0n,
        amount: p.amount,
        destination: Address.parse(r.to),
        responseDestination: p.payer,
        forwardTonAmount: FORWARD_TON,
        forwardPayload: r.text?.trim() ? r.text : null
      })
    }
  }
  return {
    address: r.to,
    amount: p.amount,
    ...(r.bin ? { payload: fromB64url(r.bin) } : r.text?.trim() ? { payload: commentBody(r.text) } : {}),
    ...(r.init ? { stateInit: fromB64url(r.init) } : {})
  }
}

/** Why this request cannot be paid from the checkout page (null = it can). */
export function payBlocker(r: PaymentRequest, o: { amount: bigint | null, now?: number, jettonBalance?: bigint | null }): string | null {
  if (r.exp !== undefined && r.exp <= (o.now ?? Date.now() / 1000)) return 'This payment link has expired. Ask the recipient for a new one.'
  if (r.jetton && (r.bin || r.init)) return 'This link combines a token with a binary body or StateInit, which TonUtils does not send. Use the wallet links below.'
  if (o.amount === null || o.amount <= 0n) return 'Enter the amount you want to pay.'
  if (r.jetton && o.jettonBalance != null && o.jettonBalance < o.amount) return 'Your wallet does not hold enough of this token.'
  return null
}

/** Random 64-bit query id (unique per payment, so the jetton wallet's response can be told apart). */
export function newQueryId(random: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))): bigint {
  return random(8).reduce((acc, b) => (acc << 8n) | BigInt(b), 0n)
}
