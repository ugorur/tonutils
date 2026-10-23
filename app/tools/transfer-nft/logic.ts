// TEP-62 NFT transfer (also .ton domains, Telegram usernames and numbers) as TonConnect messages.
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Note } from '~/lib/wallet-actions/core'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { formatCoin } from '~/utils/currency'
import { nftTransferBody } from '~/utils/ton/messages'

/** 1 nanoGRAM forwarded so the new owner gets an ownership_assigned notification (and the comment). */
export const FORWARD_AMOUNT = 1n

/** Fragment collections (mainnet). */
const TELEGRAM_USERNAMES = Address.parse('EQCA14o1-VWhS2efqoh_9M1b_A9DtKTuoqfmkn83AbJzwnPi').toRawString()
const TELEGRAM_NUMBERS = Address.parse('EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N').toRawString()

/** tonapi /v2/accounts/{id}/nfts item (fields used here). */
export interface TonapiNft {
  address: string
  index?: number | string
  collection?: { address: string, name?: string }
  metadata?: { name?: string, image?: string }
  previews?: { resolution: string, url: string }[]
  dns?: string
  trust?: string
}

export type NftKind = 'nft' | 'domain' | 'username' | 'number'

export interface OwnedNft {
  /** Raw, lowercase. */
  address: string
  name: string
  collection: string | null
  image?: string
  /** tonapi trust: whitelist | none | graylist | blacklist (spam). */
  trust: string
  kind: NftKind
}

export function toOwnedNft(n: TonapiNft): OwnedNft {
  const coll = n.collection?.address.toLowerCase() ?? null
  const kind: NftKind = n.dns ? 'domain' : coll === TELEGRAM_USERNAMES ? 'username' : coll === TELEGRAM_NUMBERS ? 'number' : 'nft'
  return {
    address: n.address.toLowerCase(),
    name: n.dns ?? n.metadata?.name ?? `#${n.index ?? '?'}`,
    collection: n.collection?.name || null,
    image: n.previews?.find(p => p.resolution === '100x100')?.url ?? n.metadata?.image,
    trust: n.trust ?? 'none',
    kind
  }
}

/** TEP-85 soulbound tokens cannot be transferred: toncenter reports the 'sbt' interface for them. */
export const isSbt = (interfaces: readonly string[] | null | undefined) => !!interfaces?.includes('sbt')

/** Message to the NFT item with TOKEN_GAS attached; the excess returns to the current owner. */
export function buildNftTransfer(p: { item: string, owner: Address, newOwner: Address, comment: string, queryId: bigint }): TonConnectMessage {
  return {
    address: p.item,
    amount: TOKEN_GAS,
    payload: nftTransferBody({
      queryId: p.queryId,
      newOwner: p.newOwner,
      responseDestination: p.owner,
      forwardAmount: FORWARD_AMOUNT,
      forwardPayload: p.comment.trim() ? p.comment : null
    })
  }
}

/** Blocking problems and heads-ups for a selection. `interfaces` maps raw address → toncenter interfaces. */
export function transferNotes(items: OwnedNft[], interfaces: Record<string, string[] | null>, coinBalance: bigint | null): Note[] {
  const out: Note[] = []
  const sbts = items.filter(i => isSbt(interfaces[i.address]))
  if (sbts.length) out.push({ level: 'error', text: `${sbts.map(s => s.name).join(', ')}: soulbound (SBT), bound to your address for good. Soulbound tokens cannot be transferred; unselect them.` })
  if (items.some(i => i.kind === 'domain')) out.push({ level: 'info', text: 'Transferring a .ton domain hands over its ownership. Its records (the wallet it points to, site) stay as they are until the new owner changes them.' })
  if (items.some(i => i.kind === 'username' || i.kind === 'number')) out.push({ level: 'info', text: 'Telegram usernames and numbers that are linked to a Telegram account may have to be released on Fragment first; if the item refuses the transfer, the attached fee comes back.' })
  if (items.some(i => i.trust === 'blacklist')) out.push({ level: 'warning', text: 'Some selected NFTs are flagged as spam. Spam NFTs often carry phishing links: do not open them.' })
  const need = TOKEN_GAS * BigInt(items.length)
  if (coinBalance !== null && items.length && coinBalance < need) {
    out.push({ level: 'error', text: `Moving ${items.length} NFT${items.length > 1 ? 's' : ''} needs ${formatCoin(need)} attached for fees (most of it comes back). Your wallet has ${formatCoin(coinBalance)}.` })
  }
  return out
}
