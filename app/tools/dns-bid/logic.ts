import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { DomainLookup, DomainStatus } from '~/lib/dns-write/dns'
import { DNS_COLLECTION, minPrice, releaseBody } from '~/lib/dns-write/dns'
import { commentBody } from '~/utils/ton/messages'

export type BidAction =
  /** Free name: text comment with the name to the collection, which deploys the item and opens the auction. */
  | { kind: 'start', to: string, min: bigint }
  /** Running auction: plain transfer to the item. The previous top bidder is refunded by the item. */
  | { kind: 'bid', to: string, min: bigint }
  /** Expired for over a year: dns_balance_release to the item opens a 1-week auction with you as first bidder. */
  | { kind: 'release', to: string, min: bigint }

/** What can be sent for this domain right now, or null (owned, or won and waiting to be claimed). */
export function bidAction(lookup: DomainLookup, status: DomainStatus, network: TonNetwork, now: number): BidAction | null {
  const testOnly = network === 'testnet'
  const item = lookup.address.toString({ bounceable: true, testOnly, urlSafe: true })
  const nameLength = Buffer.byteLength(lookup.name || lookup.item?.domain || '', 'utf8')
  switch (status.kind) {
    case 'free':
      return { kind: 'start', to: Address.parse(DNS_COLLECTION[network]).toString({ bounceable: true, testOnly, urlSafe: true }), min: minPrice(nameLength, now) }
    case 'auction':
      return { kind: 'bid', to: item, min: status.minNextBid }
    case 'expired':
      return { kind: 'release', to: item, min: minPrice(nameLength, now) }
    default:
      return null
  }
}

/**
 * The single message for an action. Bounceable, so a failed start/bid/release (outbid in the same block, auction just ended,
 * amount too low) bounces the value back minus fees.
 */
export function bidMessage(action: BidAction, name: string, amount: bigint, queryId = 0n): TonConnectMessage {
  if (amount < action.min) throw new Error('Amount is below the minimum')
  if (action.kind === 'start') return { address: action.to, amount, payload: commentBody(name) }
  if (action.kind === 'release') return { address: action.to, amount, payload: releaseBody(queryId) }
  return { address: action.to, amount }
}
