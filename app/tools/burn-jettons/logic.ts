// TEP-74 burn: a message to YOUR jetton wallet that destroys tokens for good (cleans spam out of a wallet).
import type { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Note, OwnedJetton } from '~/lib/wallet-actions/core'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { formatCoin } from '~/utils/currency'
import { jettonBurnBody } from '~/utils/ton/messages'

/** Message to the owner's jetton wallet with TOKEN_GAS attached; the excess returns to the owner. */
export function buildBurn(p: { jettonWallet: string, owner: Address, amount: bigint, queryId: bigint }): TonConnectMessage {
  return {
    address: p.jettonWallet,
    amount: TOKEN_GAS,
    payload: jettonBurnBody({ queryId: p.queryId, amount: p.amount, responseDestination: p.owner })
  }
}

export interface BurnItem {
  jetton: OwnedJetton
  amount: bigint
}

/**
 * What gets burned: the whole unlocked balance of each selected token, or `customAmount` when exactly one
 * is selected. Tokens that cannot be burned are left out with an explanation.
 */
export function burnPlan(selected: OwnedJetton[], opts: { coinBalance: bigint | null, customAmount?: bigint | null }): { items: BurnItem[], notes: Note[] } {
  const items: BurnItem[] = []
  const notes: Note[] = []
  for (const j of selected) {
    const free = j.balance > j.locked ? j.balance - j.locked : 0n
    if (j.needsClaim) {
      notes.push({ level: 'warning', text: `${j.symbol}: not claimed to your wallet yet, so there is nothing on chain to burn. Skipped.` })
      continue
    }
    if (free === 0n) {
      notes.push({ level: 'warning', text: `${j.symbol}: zero ${j.locked ? 'unlocked ' : ''}balance. Skipped.` })
      continue
    }
    let amount = free
    if (selected.length === 1 && opts.customAmount !== undefined && opts.customAmount !== null) {
      if (opts.customAmount <= 0n || opts.customAmount > free) {
        notes.push({ level: 'error', text: `Enter an amount between 0 and your ${j.locked ? 'unlocked ' : ''}balance.` })
        continue
      }
      amount = opts.customAmount
    }
    if (j.verification === 'whitelist') notes.push({ level: 'warning', text: `${j.symbol} is a verified token that may have real value. Burning destroys it for good; nobody can give it back.` })
    items.push({ jetton: j, amount })
  }
  const need = TOKEN_GAS * BigInt(items.length)
  if (opts.coinBalance !== null && items.length && opts.coinBalance < need) {
    notes.push({ level: 'error', text: `Burning ${items.length} token${items.length > 1 ? 's' : ''} needs ${formatCoin(need)} attached for fees (most of it comes back). Your wallet has ${formatCoin(opts.coinBalance)}.` })
  }
  return { items, notes }
}
