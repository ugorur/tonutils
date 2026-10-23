import { OPCODES, opHex, parseOp } from '~/utils/ton/opcodes'
import type { OpGroup, OpcodeInfo } from '~/utils/ton/opcodes'

export type LookupGroup = OpGroup | 'core'

export interface LookupEntry extends Omit<OpcodeInfo, 'group'> {
  group: LookupGroup
}

// Op codes the shared table does not carry. Each one is copied from the cited source (read 2026-10-23).
export const EXTRA_OPCODES: readonly LookupEntry[] = [
  { op: 0xffffffff, name: 'bounced', title: 'Bounced message prefix', group: 'core', source: 'docs.ton.org (messages: default bounce)', tlb: 'bounced body = 0xffffffff + first 256 bits of the original body' },
  { op: 0xfffffffe, name: 'new_bounce_body', title: 'Bounced message (new rich format)', group: 'core', source: 'docs.ton.org (messages: new bounce format)', tlb: 'new_bounce_body#fffffffe original_body:^Cell original_info:^NewBounceOriginalInfo bounced_by_phase:uint8 exit_code:int32 compute_phase:(Maybe NewBounceComputePhaseInfo) = NewBounceBody;' },
  { op: 0x7431f221, name: 'jetton_drop_admin', title: 'Drop jetton admin', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract (jetton.tlb)', tlb: 'drop_admin#7431f221 query_id:uint64 = InternalMsgBody;' },
  { op: 0x235caf52, name: 'jetton_call_to', title: 'Jetton minter call_to (admin action on a wallet)', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract (JettonConstants.ts)' },
  { op: 0x00000001, name: 'nft_collection_deploy_item', title: 'NFT collection: deploy item', group: 'nft', source: 'ton-blockchain/token-contract nft-collection.fc' },
  { op: 0x00000002, name: 'nft_collection_batch_deploy', title: 'NFT collection: batch deploy items', group: 'nft', source: 'ton-blockchain/token-contract nft-collection.fc' },
  { op: 0x00000003, name: 'nft_collection_change_owner', title: 'NFT collection: change owner', group: 'nft', source: 'ton-blockchain/token-contract nft-collection.fc' },
  { op: 0x5fcc3d1a, name: 'nft_reveal_user_request', title: 'NFT reveal: user request', group: 'nft', source: 'TEP-122', tlb: 'nft_reveal_user_request#5fcc3d1a query_id:uint64 = InternalMsgBody;' },
  { op: 0x5fcc3d1b, name: 'nft_reveal_nft_request', title: 'NFT reveal: item asks collection', group: 'nft', source: 'TEP-122', tlb: 'nft_reveal_nft_request#5fcc3d1b query_id:uint64 index:uint256 = InternalMsgBody;' },
  { op: 0x5fcc3d1c, name: 'nft_reveal_success_collection_response', title: 'NFT reveal: collection response', group: 'nft', source: 'TEP-122', tlb: 'nft_reveal_success_collection_response#5fcc3d1c query_id:uint64 success:Bool new_content:(Maybe (Either Cell ^Cell)) = InternalMsgBody;' },
  { op: 0x5fcc3d1d, name: 'collection_add_reveal_batch', title: 'NFT reveal: add reveal batch', group: 'nft', source: 'TEP-122', tlb: 'collection_add_reveal_batch#5fcc3d1d query_id:uint64 new_content_batch:Hashmap 64 Either Cell ^Cell = InternalMsgBody;' },
  { op: 0x013a3ca6, name: 'cnft_claim', title: 'Compressed NFT claim', group: 'nft', source: 'TEP-126', tlb: 'claim#013a3ca6 query_id:uint64 item_index:uint256 proof:^Cell = InternalMsgBody;' },
  { op: 0xac392598, name: 'display_multiplier_changed', title: 'Scaled UI jetton: display multiplier changed (external out)', group: 'jetton-minter', source: 'TEP-526', tlb: 'display_multiplier_changed#ac392598 numerator:(VarUInteger 32) denominator:(VarUInteger 32) comment:(Maybe SnakeString) = ExternalOutMsgBody;' }
]

export const ALL_OPCODES: readonly LookupEntry[] = [...OPCODES, ...EXTRA_OPCODES]

export const GROUP_LABELS: Record<LookupGroup, string> = {
  'core': 'Core / bounce',
  'comment': 'Comments',
  'jetton': 'Jettons',
  'jetton-minter': 'Jetton minter',
  'nft': 'NFTs',
  'sbt': 'SBTs',
  'dns': 'DNS',
  'wallet': 'Wallets',
  'dex': 'DEX',
  'staking': 'Staking',
  'elector': 'Elector',
  'highload': 'Highload wallet',
  'multisig': 'Multisig',
  'vesting': 'Vesting'
}

/** The same 32-bit op in the notations people paste: hex, unsigned and signed decimal. */
export function opForms(op: number) {
  const u = op >>> 0
  return { hex: opHex(u), unsigned: String(u), signed: String(u | 0) }
}

/**
 * Searches by op code (hex with or without 0x, signed/unsigned decimal), by a hex fragment, or by words.
 * Exact op matches come first.
 */
export function searchOpcodes(query: string, group?: LookupGroup): LookupEntry[] {
  const pool = group ? ALL_OPCODES.filter(e => e.group === group) : ALL_OPCODES
  const q = query.trim().toLowerCase()
  if (!q) return [...pool]
  const op = parseOp(q)
  const exact = op === null ? [] : pool.filter(e => e.op >>> 0 === op)
  const frag = /^(0x)?[0-9a-f]{3,7}$/.test(q) ? q.replace(/^0x/, '') : null
  const words = q.split(/\s+/)
  const rest = pool.filter((e) => {
    if (exact.includes(e)) return false
    if (frag && opHex(e.op).slice(2).includes(frag)) return true
    const hay = `${e.name} ${e.title} ${e.source} ${e.tlb ?? ''} ${GROUP_LABELS[e.group]}`.toLowerCase().replace(/_/g, ' ')
    return words.every(w => hay.includes(w.replace(/_/g, ' ')))
  })
  return [...exact, ...rest]
}

/** Reads toncenter `GET /api/v3/decode?opcodes=…` → the name, or null when it says "unknown". */
export function decodedName(res: { opcodes?: unknown[] } | null | undefined): string | null {
  const name = res?.opcodes?.[0]
  return typeof name === 'string' && name && name !== 'unknown' ? name : null
}
