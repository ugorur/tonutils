// TEP-62 NFT and TEP-85 SBT message bodies. NFT transfer / get_static_data reuse the shared,
// mainnet-verified builders; the SBT bodies follow the TL-B in TEP-85 (cross-checked with mainnet bodies in the tests).
import type { Address, Cell } from '@ton/core'
import { beginCell } from '@ton/core'
import { nftGetStaticDataBody, nftTransferBody } from '~/utils/ton/messages'
import { OP } from '~/utils/ton/opcodes'
import { COIN_SYMBOL } from '~/utils/currency'

export type NftAction = 'transfer' | 'static' | 'prove' | 'request' | 'destroy' | 'revoke'

export interface ActionInfo {
  value: NftAction
  label: string
  /** Who must send it for the item to accept it. */
  sender: 'owner' | 'anyone' | 'authority'
  sbt: boolean
  about: string
}

export const NFT_ACTIONS: ActionInfo[] = [
  { value: 'transfer', label: 'Transfer', sender: 'owner', sbt: false, about: 'TEP-62 transfer#5fcc3d14: moves the NFT to a new owner. Soulbound tokens (SBT) reject it.' },
  { value: 'static', label: 'Get static data', sender: 'anyone', sbt: false, about: 'TEP-62 get_static_data#2fcb26a2: the item replies with report_static_data (its index and collection).' },
  { value: 'prove', label: 'SBT: prove ownership', sender: 'owner', sbt: true, about: 'TEP-85 prove_ownership#04ded148: the SBT sends ownership_proof to dest with your payload, proving you own it.' },
  { value: 'request', label: 'SBT: request owner', sender: 'anyone', sbt: true, about: 'TEP-85 request_owner#d0c3bfea: the SBT sends owner_info (owner, data, revoked_at) to dest.' },
  { value: 'destroy', label: 'SBT: destroy', sender: 'owner', sbt: true, about: 'TEP-85 destroy#1f04537a: the owner wipes the SBT (owner and authority set to none) and gets its balance back. Irreversible.' },
  { value: 'revoke', label: 'SBT: revoke', sender: 'authority', sbt: true, about: 'TEP-85 revoke#6f89f5e3: the authority (usually the issuer) marks the SBT as revoked. Irreversible.' }
]

/** GRAM to attach. Unused value returns to the response address / owner. */
export const NFT_GAS = 50_000_000n // 0.05 GRAM

export interface TransferParams {
  queryId: bigint
  newOwner: Address
  responseDestination: Address | null
  forwardAmount: bigint
  forwardPayload: Cell | null
  customPayload: Cell | null
}

export interface ProveParams {
  queryId: bigint
  dest: Address
  /** forward_payload:^Cell is mandatory in TEP-85; an empty cell is used when none is given. */
  forwardPayload: Cell | null
  withContent: boolean
}

export type NftParams =
  | { action: 'transfer', p: TransferParams }
  | { action: 'prove' | 'request', p: ProveParams }
  | { action: 'static' | 'destroy' | 'revoke', p: { queryId: bigint } }

/** prove_ownership / request_owner: op query_id:uint64 dest:MsgAddress forward_payload:^Cell with_content:Bool */
export function sbtProveBody(op: 'sbt_prove_ownership' | 'sbt_request_owner', p: ProveParams): Cell {
  return beginCell()
    .storeUint(OP(op), 32)
    .storeUint(p.queryId, 64)
    .storeAddress(p.dest)
    .storeRef(p.forwardPayload ?? beginCell().endCell())
    .storeBit(p.withContent)
    .endCell()
}

/** op + query_id only (destroy, revoke). */
export function opQueryBody(op: 'sbt_destroy' | 'sbt_revoke', queryId: bigint): Cell {
  return beginCell().storeUint(OP(op), 32).storeUint(queryId, 64).endCell()
}

export function buildNftBody(x: NftParams): Cell {
  switch (x.action) {
    case 'transfer':
      return nftTransferBody(x.p)
    case 'static':
      return nftGetStaticDataBody(x.p.queryId)
    case 'prove':
      return sbtProveBody('sbt_prove_ownership', x.p)
    case 'request':
      return sbtProveBody('sbt_request_owner', x.p)
    case 'destroy':
      return opQueryBody('sbt_destroy', x.p.queryId)
    case 'revoke':
      return opQueryBody('sbt_revoke', x.p.queryId)
  }
}

export function recommendedAttach(action: NftAction, forwardAmount = 0n): bigint {
  return action === 'transfer' ? forwardAmount + NFT_GAS : NFT_GAS
}

/** A message the item will reject, explained before the user pays for it. */
export function senderProblem(action: NftAction, item: { owner: Address | null, onSale?: boolean } | null, sender: Address | null): string | null {
  const info = NFT_ACTIONS.find(a => a.value === action)!
  if (!item || !sender || info.sender !== 'owner') return null
  if (item.onSale) return 'This NFT is listed for sale: the sale contract owns it now. Cancel the listing on the marketplace first.'
  if (item.owner && !item.owner.equals(sender)) return `Your connected wallet is not the owner of this item, so it will reject the message and bounce your ${COIN_SYMBOL} (minus fees).`
  return null
}
