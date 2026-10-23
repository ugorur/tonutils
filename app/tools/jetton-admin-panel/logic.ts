// Jetton admin panel: reads a minter, works out which admin messages it understands and builds them.
// Pure TS (+ @ton/core).
import { Address, Cell } from '@ton/core'
import {
  changeAdminBody, changeMetadataBody, claimAdminBody, dropAdminBody, FEES, flavorByCodeHash, mintBody,
  type MinterFamily, type MinterFlavor
} from '~/lib/token-launch/jetton-minter'
import { jettonDecimals } from '~/utils/ton/jetton'

/** toncenter v3 GET /jetton/masters?address= (one item). */
export interface ToncenterJettonMaster {
  address: string
  total_supply: string
  mintable: boolean
  admin_address: string | null
  jetton_content: Record<string, string> | null
  jetton_wallet_code_hash: string
  code_hash: string
}

/** tonapi GET /blockchain/accounts/{id}/methods/get_next_admin_address. */
export interface TonapiMethodResult {
  success: boolean
  exit_code: number
  stack: { type: string, cell?: string, slice?: string, num?: string }[]
}

export interface MasterState {
  raw: string
  totalSupply: bigint
  /** Raw admin, or null when there is none (dropped, or the zero address). */
  admin: string | null
  content: Record<string, string>
  decimals: number
  codeHash: string
}

const ZERO_RAW = `0:${'0'.repeat(64)}`

/**
 * `offchainDecimals`: toncenter `metadata[…].token_info[0].extra.decimals`. For off-chain metadata the
 * on-chain content often has only `uri`, and the decimals live in the JSON file (e.g. STON).
 */
export function parseMaster(m: ToncenterJettonMaster, offchainDecimals?: string): MasterState {
  const admin = m.admin_address && m.admin_address.toLowerCase() !== ZERO_RAW ? m.admin_address.toLowerCase() : null
  const content = m.jetton_content ?? {}
  const decimals = jettonDecimals(content.decimals == null && offchainDecimals ? { decimals: offchainDecimals } : content)
  return { raw: m.address.toLowerCase(), totalSupply: BigInt(m.total_supply), admin, content, decimals, codeHash: m.code_hash }
}

/**
 * get_next_admin_address only exists in the Jetton 2.x family (two-step admin transfer).
 * Exit code 11 (no such method) means a classic minter. Returns the pending admin, if any.
 */
export function parseNextAdmin(r: TonapiMethodResult): { family: MinterFamily, nextAdmin: string | null } | null {
  if (!r.success || r.exit_code !== 0) return r.exit_code === 11 ? { family: 'legacy', nextAdmin: null } : null
  const item = r.stack[0]
  const boc = item?.cell ?? item?.slice
  if (!item || item.type === 'null' || !boc) return { family: 'v2', nextAdmin: null }
  const a = Cell.fromHex(boc).beginParse().loadMaybeAddress()
  return { family: 'v2', nextAdmin: a ? a.toRawString() : null }
}

export interface Detected {
  family: MinterFamily
  /** Known, verified code (null = we only know the family from its get methods). */
  flavor: MinterFlavor | null
  /** content: full TEP-64 cell, uri: URL only, null: unknown (metadata change disabled). */
  metadata: 'content' | 'uri' | null
}

export function detect(codeHash: string, family: MinterFamily | null): Detected | null {
  const flavor = flavorByCodeHash(codeHash)
  if (flavor) return { family: flavor.family, flavor, metadata: flavor.metadata }
  if (!family) return null
  // Classic minters (token-contract and its forks) all take change_content#4 with a content cell.
  return { family, flavor: null, metadata: family === 'legacy' ? 'content' : null }
}

export type ActionId = 'mint' | 'change-admin' | 'claim-admin' | 'drop-admin' | 'metadata'

export const ACTIONS: Record<ActionId, { label: string, icon: string }> = {
  'mint': { label: 'Mint', icon: 'i-lucide-coins' },
  'change-admin': { label: 'Change admin', icon: 'i-lucide-user-cog' },
  'claim-admin': { label: 'Claim admin', icon: 'i-lucide-user-check' },
  'drop-admin': { label: 'Renounce', icon: 'i-lucide-lock' },
  'metadata': { label: 'Metadata', icon: 'i-lucide-file-pen' }
}

/** What the connected wallet may do. The contract enforces the same rules; we just hide what would bounce. */
export function availableActions(s: MasterState, d: Detected, wallet: string, nextAdmin: string | null): ActionId[] {
  const me = wallet.toLowerCase()
  const out: ActionId[] = []
  if (s.admin === me) {
    out.push('mint', 'change-admin')
    // The stablecoin contract has no drop_admin op (ton-blockchain/stablecoin-contract op-codes.fc): it would bounce.
    if (d.flavor?.id !== 'stablecoin') out.push('drop-admin')
    if (d.metadata) out.push('metadata')
  }
  if (d.family === 'v2' && nextAdmin && nextAdmin.toLowerCase() === me) out.push('claim-admin')
  return out
}

export interface AdminMessage {
  address: string
  amount: bigint
  payload: Cell
}

export type ActionInput =
  | { id: 'mint', to: Address, amount: bigint, response: Address }
  | { id: 'change-admin', newAdmin: Address }
  | { id: 'claim-admin' }
  | { id: 'drop-admin' }
  | { id: 'metadata', content: Cell | string }

/** The single message for an action, to the minter, bounceable (a wrong guess bounces back minus fees). */
export function actionMessage(master: string, d: Detected, input: ActionInput, testnet: boolean): AdminMessage {
  const address = Address.parse(master).toString({ bounceable: true, testOnly: testnet, urlSafe: true })
  const fees = FEES[d.family]
  switch (input.id) {
    case 'mint':
      return { address, amount: fees.mint, payload: mintBody({ family: d.family, to: input.to, amount: input.amount, response: input.response }) }
    case 'change-admin':
      return { address, amount: fees.admin, payload: changeAdminBody(d.family, input.newAdmin) }
    case 'claim-admin':
      return { address, amount: fees.admin, payload: claimAdminBody() }
    case 'drop-admin':
      return { address, amount: fees.admin, payload: dropAdminBody(d.family) }
    case 'metadata':
      if (!d.metadata) throw new Error('Metadata changes are not supported for this minter')
      return { address, amount: fees.admin, payload: changeMetadataBody({ family: d.family, metadata: d.metadata }, input.content) }
  }
}
