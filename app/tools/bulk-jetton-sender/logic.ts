// Bulk jetton transfer: one TEP-74 transfer per checked row, all sent to the owner's own jetton wallet.
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { CheckedRow } from '~/lib/bulk-actions/recipients'
import type { Note, OwnedJetton } from '~/lib/wallet-actions/core'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { formatJettonAmount } from '~/utils/ton/jetton'
import { jettonTransferBody } from '~/utils/ton/messages'

/** forward_ton_amount: 1 nanoGRAM makes the recipient's wallet get a transfer_notification (shows the comment). */
export const FORWARD_TON = 1n
/** GRAM attached to each transfer (covers the forward amount too, as Tonkeeper does); the unused part returns as excesses. */
export const ATTACHED = TOKEN_GAS

/**
 * One message per row to the sender's jetton wallet (bounceable), carrying jetton_transfer with
 * response_destination = sender (excess GRAM comes back) and the comment as forward payload.
 * Query ids are `queryId0 + index` so every transfer in the batch is distinct. [] while any row is blocked.
 */
export function buildBulkJettonMessages(p: { rows: CheckedRow[], jettonWallet: string, owner: Address, testnet: boolean, queryId0: bigint }): TonConnectMessage[] {
  if (!p.rows.length || p.rows.some(r => r.blocked)) return []
  const to = Address.parse(p.jettonWallet).toString({ bounceable: true, testOnly: p.testnet, urlSafe: true })
  return p.rows.map((r, i) => ({
    address: to,
    amount: ATTACHED,
    payload: jettonTransferBody({
      queryId: p.queryId0 + BigInt(i),
      amount: r.amount!,
      destination: r.address!,
      responseDestination: p.owner,
      forwardTonAmount: FORWARD_TON,
      forwardPayload: r.comment || undefined
    })
  }))
}

/** Token-side problems: mintless jettons that must be claimed first, locked or insufficient balance. */
export function jettonNotes(j: OwnedJetton, total: bigint): Note[] {
  const out: Note[] = []
  const fmt = (v: bigint) => formatJettonAmount(v, j.decimals, { symbol: j.symbol })
  if (j.needsClaim) out.push({ level: 'error', text: `${j.symbol} is a mintless jetton that has to be claimed before it can be sent. Claim it in your wallet app first.` })
  const free = j.balance - j.locked
  if (j.locked > 0n) out.push({ level: 'info', text: `${fmt(j.locked)} is locked and cannot be sent.` })
  if (total > free) out.push({ level: 'error', text: `The list adds up to ${fmt(total)} but only ${fmt(free)} is available.` })
  if (j.verification === 'blacklist') out.push({ level: 'warning', text: `tonapi marks ${j.symbol} as a scam token. Recipients will see it as spam.` })
  return out
}
