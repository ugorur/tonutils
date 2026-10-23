// Scam checker: what an address is (wallet, token, NFT, contract) and every scam signal public data has on it.
import type { TonapiJetton } from '~/lib/jettons-read/core'
import { isRenounced } from '~/lib/jettons-read/core'
import { type Check, impersonates, isSpamSender, type Label, scamTextReason, type SenderProfile, trustCheck } from '~/lib/security/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { COIN_SYMBOL } from '~/utils/currency'
import { classifyNft } from '../spam-nft-cleaner/logic'

export const EXAMPLES = [
  { label: 'Fake GRAM airdrop token', value: 'EQBjIKbFb9eDW3L86C0k6fpX55zn_rqOzcD85OTxGdffeiDy' },
  { label: 'Spam voucher NFT', value: 'EQDmcXzGlZPxlO9rJyrnwgaRyAFPw6Y7QzJB4-wyoVPHhfpA' },
  { label: 'Tether USD', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' }
]

export type Kind = 'wallet' | 'jetton' | 'jetton-wallet' | 'nft' | 'collection' | 'contract' | 'empty'

export function kindOf(a: TonapiAccount): Kind {
  const i = a.interfaces ?? []
  if (i.includes('jetton_master')) return 'jetton'
  if (i.some(x => x.startsWith('jetton_wallet'))) return 'jetton-wallet'
  if (i.includes('nft_item')) return 'nft'
  if (i.includes('nft_collection')) return 'collection'
  if (a.status !== 'active' && a.status !== 'frozen') return 'empty'
  return a.is_wallet ? 'wallet' : 'contract'
}

export const KIND_LABEL: Record<Kind, string> = {
  'wallet': 'Wallet',
  'jetton': 'Token (jetton master)',
  'jetton-wallet': 'Token balance contract (jetton wallet)',
  'nft': 'NFT item',
  'collection': 'NFT collection',
  'contract': 'Smart contract',
  'empty': 'Unused address'
}

/** tonapi GET /v2/nfts/collections/{a} (fields used here). */
export interface TonapiCollection {
  address: string
  trust?: string
  metadata?: { name?: string, description?: string }
  metadata_status?: { url?: string, is_broken?: boolean }
}

export interface ScamInput {
  account: TonapiAccount
  label?: Label
  /** The token: the account itself, or the master of a jetton wallet. */
  jetton?: TonapiJetton | null
  nft?: TonapiNft | null
  collection?: TonapiCollection | null
  profile?: SenderProfile | null
}

export function scamChecks(i: ScamInput): Check[] {
  const out: Check[] = []
  const a = i.account
  const kind = kindOf(a)
  if (a.is_scam) out.push({ level: 'danger', title: 'This account is flagged as a scam by tonapi (Tonkeeper)' })
  const name = a.name ?? i.label?.name
  if (name) out.push({ level: 'ok', title: `Known as “${name}”`, detail: a.name ? 'Name from tonapi / Tonkeeper.' : 'From Tonkeeper\'s public ton-assets list.' })

  if (i.jetton) {
    const j = i.jetton
    const sym = j.metadata.symbol ?? '?'
    const what = kind === 'jetton-wallet' ? `Its token ${sym}` : `Token ${sym}`
    out.push(trustCheck(j.verification, what))
    const bait = scamTextReason([j.metadata.name, sym, j.metadata.description].join(' \n '))
    if (bait) out.push({ level: 'danger', title: `The token's name or description ${bait}`, detail: `“${j.metadata.name ?? ''} (${sym})”: real projects do not put sites or “claim” instructions in a token name. This is advertising for a phishing site.` })
    const copies = j.verification === 'whitelist' ? null : impersonates(sym, j.metadata.address)
    if (copies) out.push({ level: 'danger', title: `Pretends to be ${copies}`, detail: 'Same ticker as a well-known token, different contract. The real one has a different master address.' })
    if (j.verification !== 'whitelist' && j.mintable && !isRenounced(j.admin?.address)) {
      out.push({ level: 'warn', title: 'The creator can still mint more', detail: 'An admin wallet controls this unverified token. Run the token safety check for supply, holders and liquidity.', link: { to: '/tools/token-safety-check', label: 'Token safety check' } })
    }
  }

  if (i.nft) {
    const c = classifyNft(i.nft)
    if (c.cls === 'scam') out.push(trustCheck('blacklist', 'This NFT'))
    else if (c.cls === 'suspicious') out.push({ level: 'danger', title: 'Looks like a scam NFT', detail: `${c.reasons.join('. ')}. Do not visit its links or send anything to “redeem” it.` })
    else if (c.cls === 'trusted') out.push({ level: 'ok', title: c.reasons[0] ?? 'Verified' })
    else out.push(trustCheck(i.nft.trust, 'This NFT'))
    if (c.cls === 'scam' || c.cls === 'suspicious') out.push({ level: 'info', title: 'Hide or burn it safely', detail: 'Hiding it in your wallet is free. To remove it for good, test it first: many spam NFTs are traps that keep the coins you attach.', link: { to: '/tools/spam-nft-cleaner', label: 'Spam NFT cleaner' } })
  }

  if (i.collection) {
    out.push(trustCheck(i.collection.trust, 'This collection'))
    const bait = scamTextReason(i.collection.metadata?.name) ?? scamTextReason(i.collection.metadata?.description)
    if (bait && i.collection.trust !== 'whitelist') out.push({ level: 'warn', title: `Collection text ${bait}` })
    if (i.collection.metadata_status?.is_broken) out.push({ level: 'info', title: 'Collection metadata is unreachable', detail: i.collection.metadata_status.url ? `${i.collection.metadata_status.url} no longer loads. Abandoned spam collections often look like this.` : undefined })
  }

  if (i.profile && isSpamSender(i.profile)) {
    out.push({ level: 'danger', title: 'Sends spam or address-poisoning transfers', detail: `Its recent outgoing transfers are ${i.profile.junkOut} tiny or spam transfers to ${i.profile.recipients} account(s), nothing of value.${i.profile.baitComment ? ` Example comment: “${i.profile.baitComment.slice(0, 80)}”.` : ''}` })
  }
  else if (i.profile?.baitComment) {
    out.push({ level: 'warn', title: 'Sends comments with links or “claim” bait', detail: `“${i.profile.baitComment.slice(0, 100)}”` })
  }

  if (kind === 'contract' && !name) {
    out.push({ level: 'warn', title: `Unknown smart contract${a.interfaces?.length ? ` (${a.interfaces.join(', ')})` : ''}`, detail: `TON has no token approvals. A site asking you to send ${COIN_SYMBOL} to a contract to “claim”, “verify”, “unlock” or “approve” something is a drainer: the coins do not come back.` })
  }
  if (kind === 'wallet' && !out.some(c => c.level === 'danger')) {
    out.push({ level: 'info', title: 'A regular wallet', detail: 'Wallets are anonymous: no flags only means nobody reported it. Scammers use fresh wallets all the time.' })
  }
  if (kind === 'empty') out.push({ level: 'info', title: 'Never used: no history to judge', detail: 'A brand-new address has no reputation either way.' })
  return out
}

export type Verdict = 'scam' | 'suspicious' | 'clean'

export function verdictOf(checks: Check[]): Verdict {
  if (checks.some(c => c.level === 'danger')) return 'scam'
  return checks.some(c => c.level === 'warn') ? 'suspicious' : 'clean'
}
