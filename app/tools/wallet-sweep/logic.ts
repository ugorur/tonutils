// Move everything from one wallet to another: every jetton, every NFT (incl. .ton domains and Telegram
// usernames/numbers), then the remaining GRAM. Message shapes match tonapi's own /v2/migration/prepare output.
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { OwnedJetton } from '~/lib/wallet-actions/core'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { jettonTransferBody, nftTransferBody } from '~/utils/ton/messages'

/** GRAM attached to each NFT transfer (tonapi's migration uses 0.06; .ton domains need more gas than plain items). */
export const NFT_GAS = 60_000_000n
/** GRAM attached to each jetton transfer (0.05, as tonapi's migration and Tonkeeper). */
export const JETTON_GAS = TOKEN_GAS
/** forward_ton_amount so the new owner gets transfer_notification / ownership_assigned. */
export const FORWARD = 1n
/**
 * Kept back by the final GRAM transfer for its own network fee. TonConnect cannot use send mode 128
 * ("send everything"), so the wallet pays the fee on top of the amount; a plain transfer costs well under this.
 */
export const SWEEP_RESERVE = 10_000_000n // 0.01 GRAM

/** tonapi /v2/accounts/{id}/nfts item (fields used here). */
export interface TonapiNft {
  address: string
  index?: number
  trust?: string
  dns?: string | null
  metadata?: { name?: string, image?: string }
  previews?: { resolution: string, url: string }[]
  collection?: { address: string, name?: string }
  sale?: unknown
}

export interface OwnedNft {
  /** Raw, lowercase. */
  address: string
  name: string
  collection: string | null
  image?: string
  /** tonapi trust: whitelist | graylist | none | blacklist (spam). */
  trust: string
  kind: 'domain' | 'telegram' | 'nft'
}

/** Fragment collections (raw), checked with toncenter v3 /nft/collections: Telegram Usernames, Anonymous Telegram Numbers. */
const TELEGRAM_COLLECTIONS = new Set([
  '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2',
  '0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2'
])

export function toOwnedNft(n: TonapiNft): OwnedNft {
  const col = n.collection?.name ?? null
  const kind = n.dns ? 'domain' : TELEGRAM_COLLECTIONS.has(n.collection?.address.toLowerCase() ?? '') ? 'telegram' : 'nft'
  return {
    address: n.address.toLowerCase(),
    name: n.dns ?? n.metadata?.name ?? `Item #${n.index ?? '?'}`,
    collection: col,
    image: n.previews?.find(p => p.resolution === '100x100')?.url ?? n.metadata?.image,
    trust: n.trust ?? 'none',
    kind
  }
}

export interface Selectable<T> {
  item: T
  /** Selected by default. */
  include: boolean
  /** Why it cannot be moved (forces include=false) or why it is unticked by default. */
  reason?: string
  /** Cannot be selected at all. */
  disabled: boolean
}

/** Default selection: skip spam (tonapi blacklist), skip empty and locked-only balances, disable unclaimed mintless. */
export function selectJettons(list: OwnedJetton[]): Selectable<OwnedJetton>[] {
  return list.map((j) => {
    const free = j.balance - j.locked
    if (j.needsClaim) return { item: j, include: false, disabled: true, reason: 'Mintless jetton: claim it in your wallet app first.' }
    if (free <= 0n) return { item: j, include: false, disabled: true, reason: j.locked > 0n ? 'Locked, nothing to move yet.' : 'Zero balance.' }
    if (j.verification === 'blacklist') return { item: j, include: false, disabled: false, reason: 'Marked as scam by tonapi. Left behind unless you tick it.' }
    return { item: j, include: true, disabled: false }
  })
}

export function selectNfts(list: OwnedNft[]): Selectable<OwnedNft>[] {
  return list.map(n => (n.trust === 'blacklist'
    ? { item: n, include: false, disabled: false, reason: 'Spam NFT (tonapi blacklist). Left behind unless you tick it.' }
    : { item: n, include: true, disabled: false }))
}

/**
 * Transfers for the chosen assets, NFTs first and then jettons (same order as tonapi's migration).
 * New owner and response_destination are both the target, so excess gas lands in the new wallet.
 * `queryId(i)` gives the query id of the i-th message.
 */
export function buildAssetMessages(p: { nfts: OwnedNft[], jettons: OwnedJetton[], target: Address, testnet: boolean, queryId: (i: number) => bigint }): TonConnectMessage[] {
  const contract = (raw: string) => Address.parse(raw).toString({ bounceable: true, testOnly: p.testnet, urlSafe: true })
  const nftMsgs = p.nfts.map((n, i) => ({
    address: contract(n.address),
    amount: NFT_GAS,
    payload: nftTransferBody({ queryId: p.queryId(i), newOwner: p.target, responseDestination: p.target, forwardAmount: FORWARD })
  }))
  const jettonMsgs = p.jettons.map((j, i) => ({
    address: contract(j.wallet),
    amount: JETTON_GAS,
    payload: jettonTransferBody({ queryId: p.queryId(p.nfts.length + i), amount: j.balance - j.locked, destination: p.target, responseDestination: p.target, forwardTonAmount: FORWARD })
  }))
  return [...nftMsgs, ...jettonMsgs]
}

/** GRAM needed for the asset step (attached gas only; network fees come on top). */
export function assetGas(nfts: number, jettons: number): bigint {
  return BigInt(nfts) * NFT_GAS + BigInt(jettons) * JETTON_GAS
}

/** Final step: everything but the fee reserve, to `destination` (bounce flag already chosen). null when nothing is left to send. */
export function buildGramSweep(balance: bigint, destination: string): TonConnectMessage | null {
  const amount = balance - SWEEP_RESERVE
  return amount > 0n ? { address: destination, amount } : null
}
