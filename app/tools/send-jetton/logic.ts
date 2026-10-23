// TEP-74 jetton transfer as a TonConnect message: sent to YOUR jetton wallet, which moves the tokens.
import type { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Note, OwnedJetton } from '~/lib/wallet-actions/core'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { formatCoin } from '~/utils/currency'
import { formatJettonAmount } from '~/utils/ton/jetton'
import { jettonTransferBody } from '~/utils/ton/messages'

/** 1 nanoGRAM forwarded with the notification: enough for wallets and explorers to show the comment. */
export const FORWARD_TON = 1n

export interface JettonSend {
  /** The sender's jetton wallet (raw or friendly). */
  jettonWallet: string
  owner: Address
  /** Recipient's main wallet (NOT their jetton wallet). */
  destination: Address
  /** Base units (respect decimals). */
  amount: bigint
  comment: string
  queryId: bigint
}

/** Message to the sender's jetton wallet with TOKEN_GAS attached; excess gas returns to the owner. */
export function buildJettonSend(p: JettonSend): TonConnectMessage {
  return {
    address: p.jettonWallet,
    amount: TOKEN_GAS,
    payload: jettonTransferBody({
      queryId: p.queryId,
      amount: p.amount,
      destination: p.destination,
      responseDestination: p.owner,
      forwardTonAmount: FORWARD_TON,
      forwardPayload: p.comment.trim() ? p.comment : null
    })
  }
}

/** Spendable = balance minus any locked part. */
export const spendable = (j: OwnedJetton) => (j.balance > j.locked ? j.balance - j.locked : 0n)

/** Everything that would make this transfer fail or be a mistake. Errors block sending. */
export function sendProblems(j: OwnedJetton, amount: bigint | null, opts: { coinBalance: bigint | null, destination?: Address | null }): Note[] {
  const out: Note[] = []
  if (j.needsClaim) out.push({ level: 'error', text: `${j.symbol} is a mintless token that has not been claimed to your wallet yet. Claim it first in the token's app or in Tonkeeper, then send it here.` })
  if (j.verification === 'blacklist') out.push({ level: 'warning', text: `${j.symbol} is flagged as spam or a scam by tonapi. Tokens like this are bait: never visit links in their name. You can burn it instead.` })
  if (amount !== null) {
    if (amount <= 0n) out.push({ level: 'error', text: 'Enter an amount greater than zero.' })
    else if (amount > spendable(j)) out.push({ level: 'error', text: `More than you can send (${formatJettonAmount(spendable(j), j.decimals, { symbol: j.symbol })}${j.locked ? ', the rest is locked' : ''}).` })
  }
  if (opts.coinBalance !== null && opts.coinBalance < TOKEN_GAS) {
    out.push({ level: 'error', text: `Sending a token needs about ${formatCoin(TOKEN_GAS)} for fees (most of it comes back). Your wallet has ${formatCoin(opts.coinBalance)}.` })
  }
  const d = opts.destination?.toRawString().toLowerCase()
  if (d && (d === j.wallet || d === j.master)) out.push({ level: 'error', text: 'That is the token\'s own contract, not a person\'s wallet. Tokens sent there are lost.' })
  return out
}
