// Mintless airdrop claim: read the issuer's claim data (via tonapi), verify it locally, build the claim transfer.
import type { Address, Cell } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { AirdropItem, MintlessWalletData } from '~/lib/jettons-dev/mintless'
import { parseClaim, parseWalletInit } from '~/lib/jettons-dev/mintless'
import { jettonTransferBody, parseBoc } from '~/utils/ton/messages'

/** GRAM attached to the claim. The reference tests claim with 0.12; the unused part returns to you as excess. */
export const CLAIM_ATTACH_NANO = 150_000_000n

/** Mintless jettons with a TEP-176 claim API (custom_payload_api_uri), checked on mainnet 2026-10-22. */
export const MINTLESS_JETTONS = [
  { symbol: 'HMSTR', name: 'Hamster Kombat', master: 'EQAJ8uWd7EBqsmpSWaRdf_I-8R8-XHwh3gsNKhy-UrdrPcUo', decimals: 9 }
] as const

/** tonapi GET /v2/jettons/{master}/transfer/{owner}/payload (it proxies the issuer's custom_payload_api_uri). BOCs in hex or base64. */
export interface TonapiTransferPayload {
  custom_payload?: string
  state_init?: string
}

export type ClaimWindow = 'not-started' | 'open' | 'expired'

export interface ClaimCheck {
  payload: Cell
  stateInit: Cell
  wallet: MintlessWalletData
  item: AirdropItem
  window: ClaimWindow
  /** Problems that make the claim fail on chain. Empty = the data is consistent. */
  problems: string[]
}

export function claimWindow(item: AirdropItem, now = Math.floor(Date.now() / 1000)): ClaimWindow {
  return now < item.startFrom ? 'not-started' : now > item.expireAt ? 'expired' : 'open'
}

/**
 * Verifies claim data the way the jetton wallet will: the proof must contain the owner's entry, its root must equal the
 * wallet's merkle_root (and the minter's, when known), and the state_init must belong to this owner and master.
 */
export function checkClaim(p: { customPayload: string, stateInit: string, owner: Address, master: Address, minterRoot?: string | null, minterWallet?: Address | null, now?: number }): ClaimCheck {
  const payload = parseBoc(p.customPayload)
  const stateInit = parseBoc(p.stateInit)
  const wallet = parseWalletInit(stateInit)
  const claim = parseClaim(payload, p.owner)
  if (!claim.item) throw new Error('The claim data does not contain an entry for this address')
  const problems: string[] = []
  if (!wallet.owner.equals(p.owner)) problems.push(`The jetton wallet in the claim data belongs to ${wallet.owner.toString()}, not to this address`)
  if (!wallet.master.equals(p.master)) problems.push('The claim data is for a different jetton')
  if (claim.root !== wallet.merkleRoot) problems.push('The proof does not match the jetton wallet\'s Merkle root')
  if (p.minterRoot && p.minterRoot !== claim.root) problems.push('The proof does not match the jetton minter\'s current Merkle root')
  // null = the minter was asked but did not answer get_wallet_address: the state_init cannot be trusted then.
  if (p.minterWallet === null) problems.push('The jetton minter did not confirm your jetton wallet address (get_wallet_address failed), so the claim data cannot be verified')
  else if (p.minterWallet && !p.minterWallet.equals(wallet.address)) problems.push(`The state_init deploys ${wallet.address.toString()}, but the jetton minter says your jetton wallet is ${p.minterWallet.toString()}`)
  return { payload, stateInit, wallet, item: claim.item, window: claimWindow(claim.item, p.now), problems }
}

/**
 * The claim message: jetton_transfer of 0 jettons to yourself carrying the claim as custom_payload, sent to your
 * jetton wallet. state_init deploys the wallet if it does not exist yet. The wallet mints the airdrop to itself.
 */
export function claimMessage(c: ClaimCheck, owner: Address, opts: { deployed: boolean, testOnly?: boolean }): TonConnectMessage {
  return {
    address: c.wallet.address.toString({ bounceable: true, testOnly: opts.testOnly }),
    amount: CLAIM_ATTACH_NANO,
    payload: jettonTransferBody({ amount: 0n, destination: owner, responseDestination: owner, customPayload: c.payload }),
    ...(opts.deployed ? {} : { stateInit: c.stateInit })
  }
}

/** custom_payload of a jetton_transfer body (base64/hex BOC), e.g. a past claim. */
export function customPayloadOf(transferBody: string): Cell {
  const s = parseBoc(transferBody).beginParse()
  if (s.loadUint(32) !== 0x0f8a7ea5) throw new Error('Not a jetton_transfer body')
  s.skip(64)
  s.loadCoins()
  s.loadAddress()
  s.loadAddress()
  const cp = s.loadMaybeRef()
  if (!cp) throw new Error('This transfer has no custom_payload')
  return cp
}
