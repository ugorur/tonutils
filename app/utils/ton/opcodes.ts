// Known 32-bit message op codes on TON. Pure data, client- and server-safe.
// Every entry was checked against toncenter's indexer decoder (GET /api/v3/decode?opcodes=…, 2026-10-22)
// or, where the indexer has no name, against the cited TEP / contract source.

export type OpGroup =
  | 'comment' | 'jetton' | 'jetton-minter' | 'nft' | 'sbt' | 'dns' | 'wallet'
  | 'dex' | 'staking' | 'elector' | 'highload' | 'multisig' | 'vesting'

export interface OpcodeInfo {
  op: number
  /** snake_case id, stable for code. */
  name: string
  /** Human label for UI. */
  title: string
  group: OpGroup
  /** Standard or project that defines it, e.g. 'TEP-74', 'STON.fi v1'. */
  source: string
  /** TL-B constructor (abbreviated where long). */
  tlb?: string
}

export const OPCODES: readonly OpcodeInfo[] = [
  // Comments (docs.ton.org "Message bodies: text comments", TEP-74 forward payload convention)
  { op: 0x00000000, name: 'text_comment', title: 'Text comment', group: 'comment', source: 'docs.ton.org', tlb: 'text_comment#00000000 text:SnakeData = InternalMsgBody;' },
  { op: 0x2167da4b, name: 'encrypted_comment', title: 'Encrypted comment', group: 'comment', source: 'docs.ton.org', tlb: 'encrypted_comment#2167da4b data:SnakeData = InternalMsgBody;' },

  // TEP-74 jettons, TEP-89 discoverable wallets
  { op: 0x0f8a7ea5, name: 'jetton_transfer', title: 'Jetton transfer', group: 'jetton', source: 'TEP-74', tlb: 'transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;' },
  { op: 0x178d4519, name: 'jetton_internal_transfer', title: 'Jetton internal transfer', group: 'jetton', source: 'TEP-74', tlb: 'internal_transfer#178d4519 query_id:uint64 amount:(VarUInteger 16) from:MsgAddress response_address:MsgAddress forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;' },
  { op: 0x7362d09c, name: 'jetton_transfer_notification', title: 'Jetton transfer notification', group: 'jetton', source: 'TEP-74', tlb: 'transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody;' },
  { op: 0xd53276db, name: 'excesses', title: 'Excesses (refund of unused gas)', group: 'jetton', source: 'TEP-74 / TEP-62', tlb: 'excesses#d53276db query_id:uint64 = InternalMsgBody;' },
  { op: 0x595f07bc, name: 'jetton_burn', title: 'Jetton burn', group: 'jetton', source: 'TEP-74', tlb: 'burn#595f07bc query_id:uint64 amount:(VarUInteger 16) response_destination:MsgAddress custom_payload:(Maybe ^Cell) = InternalMsgBody;' },
  { op: 0x7bdd97de, name: 'jetton_burn_notification', title: 'Jetton burn notification', group: 'jetton', source: 'TEP-74', tlb: 'burn_notification#7bdd97de query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress response_destination:MsgAddress = InternalMsgBody;' },
  { op: 0x2c76b973, name: 'provide_wallet_address', title: 'Provide wallet address', group: 'jetton', source: 'TEP-89', tlb: 'provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;' },
  { op: 0xd1735400, name: 'take_wallet_address', title: 'Take wallet address', group: 'jetton', source: 'TEP-89', tlb: 'take_wallet_address#d1735400 query_id:uint64 wallet_address:MsgAddress owner_address:(Maybe ^MsgAddress) = InternalMsgBody;' },
  { op: 0x642b7d07, name: 'jetton_mint', title: 'Jetton mint', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract (stablecoin, Notcoin)', tlb: 'mint#642b7d07 query_id:uint64 to_address:MsgAddress ton_amount:Coins master_msg:^InternalMsgBody = InternalMsgBody;' },
  { op: 0x00000015, name: 'jetton_mint_legacy', title: 'Jetton mint (legacy minter)', group: 'jetton-minter', source: 'ton-blockchain/token-contract' },
  { op: 0x6501f354, name: 'jetton_change_admin', title: 'Change jetton admin', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'change_admin#6501f354 query_id:uint64 new_admin_address:MsgAddress = InternalMsgBody;' },
  { op: 0xfb88e119, name: 'jetton_claim_admin', title: 'Claim jetton admin', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'claim_admin#fb88e119 query_id:uint64 = InternalMsgBody;' },
  { op: 0xcb862902, name: 'jetton_change_metadata_uri', title: 'Change jetton metadata URI', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'change_metadata_uri#cb862902 query_id:uint64 metadata:SnakeString = InternalMsgBody;' },
  { op: 0x2508d66a, name: 'jetton_upgrade', title: 'Upgrade jetton minter', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'upgrade#2508d66a query_id:uint64 new_data:^Cell new_code:^Cell = InternalMsgBody;' },
  { op: 0xeed236d3, name: 'jetton_set_status', title: 'Set jetton wallet status (lock)', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'set_status#eed236d3 query_id:uint64 status:uint4 = InternalMsgBody;' },
  { op: 0xd372158c, name: 'top_up', title: 'Top up', group: 'jetton-minter', source: 'ton-blockchain/jetton-contract', tlb: 'top_up#d372158c query_id:uint64 = InternalMsgBody;' },

  // TEP-62 NFT, TEP-66 royalty, TEP-85 SBT
  { op: 0x5fcc3d14, name: 'nft_transfer', title: 'NFT transfer', group: 'nft', source: 'TEP-62', tlb: 'transfer#5fcc3d14 query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;' },
  { op: 0x05138d91, name: 'nft_ownership_assigned', title: 'NFT ownership assigned', group: 'nft', source: 'TEP-62', tlb: 'ownership_assigned#05138d91 query_id:uint64 prev_owner:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody;' },
  { op: 0x2fcb26a2, name: 'nft_get_static_data', title: 'NFT get static data', group: 'nft', source: 'TEP-62', tlb: 'get_static_data#2fcb26a2 query_id:uint64 = InternalMsgBody;' },
  { op: 0x8b771735, name: 'nft_report_static_data', title: 'NFT report static data', group: 'nft', source: 'TEP-62', tlb: 'report_static_data#8b771735 query_id:uint64 index:uint256 collection:MsgAddress = InternalMsgBody;' },
  { op: 0x693d3950, name: 'get_royalty_params', title: 'Get royalty params', group: 'nft', source: 'TEP-66', tlb: 'get_royalty_params#693d3950 query_id:uint64 = InternalMsgBody;' },
  { op: 0xa8cb00ad, name: 'report_royalty_params', title: 'Report royalty params', group: 'nft', source: 'TEP-66', tlb: 'report_royalty_params#a8cb00ad query_id:uint64 numerator:uint16 denominator:uint16 destination:MsgAddress = InternalMsgBody;' },
  { op: 0x04ded148, name: 'sbt_prove_ownership', title: 'SBT prove ownership', group: 'sbt', source: 'TEP-85', tlb: 'prove_ownership#04ded148 query_id:uint64 dest:MsgAddress forward_payload:^Cell with_content:Bool = InternalMsgBody;' },
  { op: 0x0524c7ae, name: 'sbt_ownership_proof', title: 'SBT ownership proof', group: 'sbt', source: 'TEP-85', tlb: 'ownership_proof#0524c7ae query_id:uint64 item_id:uint256 owner:MsgAddress data:^Cell revoked_at:uint64 content:(Maybe ^Cell) = InternalMsgBody;' },
  { op: 0xd0c3bfea, name: 'sbt_request_owner', title: 'SBT request owner', group: 'sbt', source: 'TEP-85', tlb: 'request_owner#d0c3bfea query_id:uint64 dest:MsgAddress forward_payload:^Cell with_content:Bool = InternalMsgBody;' },
  { op: 0x0dd607e3, name: 'sbt_owner_info', title: 'SBT owner info', group: 'sbt', source: 'TEP-85', tlb: 'owner_info#0dd607e3 query_id:uint64 item_id:uint256 initiator:MsgAddress owner:MsgAddress data:^Cell revoked_at:uint64 content:(Maybe ^Cell) = InternalMsgBody;' },
  { op: 0x1f04537a, name: 'sbt_destroy', title: 'SBT destroy', group: 'sbt', source: 'TEP-85', tlb: 'destroy#1f04537a query_id:uint64 = InternalMsgBody;' },
  { op: 0x6f89f5e3, name: 'sbt_revoke', title: 'SBT revoke', group: 'sbt', source: 'TEP-85', tlb: 'revoke#6f89f5e3 query_id:uint64 = InternalMsgBody;' },

  // TEP-81 DNS
  { op: 0x4eb1f0f9, name: 'dns_change_record', title: 'Change DNS record', group: 'dns', source: 'TEP-81', tlb: 'change_dns_record#4eb1f0f9 query_id:uint64 key:uint256 value:(Maybe ^DNSRecord) = InternalMsgBody;' },

  // Wallets (W5 = wallet v5r1, v4 plugins)
  { op: 0x73696e74, name: 'w5_internal_signed', title: 'W5 signed request (internal)', group: 'wallet', source: 'wallet v5r1', tlb: 'internal_signed#73696e74 signed:SignedRequest = InternalMsgBody;' },
  { op: 0x7369676e, name: 'w5_external_signed', title: 'W5 signed request (external)', group: 'wallet', source: 'wallet v5r1', tlb: 'external_signed#7369676e signed:SignedRequest = ExternalMsgBody;' },
  { op: 0x6578746e, name: 'w5_extension_action', title: 'W5 extension action', group: 'wallet', source: 'wallet v5r1', tlb: 'extension_action#6578746e query_id:uint64 inner:InnerRequest = InternalMsgBody;' },
  { op: 0x0ec3c86d, name: 'action_send_msg', title: 'Out action: send message', group: 'wallet', source: 'block.tlb', tlb: 'action_send_msg#0ec3c86d mode:(## 8) out_msg:^(MessageRelaxed Any) = OutAction;' },
  { op: 0x706c7567, name: 'v4_plugin_request_funds', title: 'Plugin payment request (v4)', group: 'wallet', source: 'wallet v4r2', tlb: 'request_funds#706c7567 query_id:uint64 amount:CurrencyCollection = InternalMsgBody;' },
  { op: 0x64737472, name: 'v4_plugin_destruct', title: 'Plugin destruct (v4)', group: 'wallet', source: 'wallet v4r2', tlb: 'destruct#64737472 = InternalMsgBody;' },

  // DEX
  { op: 0x25938561, name: 'stonfi_swap', title: 'STON.fi swap (v1)', group: 'dex', source: 'STON.fi v1' },
  { op: 0xfcf9e58f, name: 'stonfi_provide_lp', title: 'STON.fi provide liquidity (v1)', group: 'dex', source: 'STON.fi v1' },
  { op: 0xf93bb43f, name: 'stonfi_payment_request', title: 'STON.fi payment request (v1)', group: 'dex', source: 'STON.fi v1' },
  { op: 0x6664de2a, name: 'stonfi_swap_v2', title: 'STON.fi swap (v2)', group: 'dex', source: 'STON.fi v2' },
  { op: 0x37c096df, name: 'stonfi_provide_lp_v2', title: 'STON.fi provide liquidity (v2)', group: 'dex', source: 'STON.fi v2' },
  { op: 0x657b54f5, name: 'stonfi_pay_to_v2', title: 'STON.fi pay to (v2)', group: 'dex', source: 'STON.fi v2' },
  { op: 0x01f3835d, name: 'pton_ton_transfer', title: 'pTON transfer (STON.fi proxy TON)', group: 'dex', source: 'STON.fi pTON v2' },
  { op: 0xea06185d, name: 'dedust_swap', title: 'DeDust swap (native vault)', group: 'dex', source: 'DeDust v2', tlb: 'swap#ea06185d query_id:uint64 amount:Coins _:SwapStep swap_params:^SwapParams = InMsgBody;' },
  { op: 0xe3a0d482, name: 'dedust_swap_jetton', title: 'DeDust swap (jetton vault payload)', group: 'dex', source: 'DeDust v2', tlb: 'swap#e3a0d482 _:SwapStep swap_params:^SwapParams = ForwardPayload;' },
  { op: 0x61ee542d, name: 'dedust_swap_external', title: 'DeDust swap (vault to pool)', group: 'dex', source: 'DeDust v2' },
  { op: 0x474f86cf, name: 'dedust_payout', title: 'DeDust payout', group: 'dex', source: 'DeDust v2' },
  { op: 0xd55e4686, name: 'dedust_deposit_liquidity', title: 'DeDust deposit liquidity (native)', group: 'dex', source: 'DeDust v2' },
  { op: 0x40e108d6, name: 'dedust_deposit_liquidity_jetton', title: 'DeDust deposit liquidity (jetton payload)', group: 'dex', source: 'DeDust v2' },

  // Staking: liquid staking and nominators (TON core nominator pool uses text comments "d" / "w")
  { op: 0x47d54391, name: 'tonstakers_deposit', title: 'Tonstakers deposit', group: 'staking', source: 'Tonstakers' },
  { op: 0x319b0cdc, name: 'tonstakers_withdraw', title: 'Tonstakers withdraw', group: 'staking', source: 'Tonstakers' },
  { op: 0x0a77535c, name: 'tonstakers_withdrawal', title: 'Tonstakers withdrawal payout', group: 'staking', source: 'Tonstakers' },
  { op: 0x1674b0a0, name: 'tonstakers_payout_mint_jettons', title: 'Tonstakers payout (mint tsTON)', group: 'staking', source: 'Tonstakers' },
  { op: 0x7bcd1fef, name: 'whales_deposit', title: 'TON Whales nominator deposit', group: 'staking', source: 'TON Whales' },
  { op: 0xda803efd, name: 'whales_withdraw', title: 'TON Whales nominator withdraw', group: 'staking', source: 'TON Whales' },
  { op: 0x4e73744b, name: 'elector_new_stake', title: 'Elector: new stake', group: 'elector', source: 'elector-code.fc' },
  { op: 0xf374484c, name: 'elector_new_stake_ok', title: 'Elector: stake accepted', group: 'elector', source: 'elector-code.fc' },
  { op: 0x47657424, name: 'elector_recover_stake', title: 'Elector: recover stake', group: 'elector', source: 'elector-code.fc' },
  { op: 0xf96f7324, name: 'elector_recover_stake_ok', title: 'Elector: stake recovered', group: 'elector', source: 'elector-code.fc' },

  // Highload wallet v3
  { op: 0xae42e5a4, name: 'highload_v3_internal_transfer', title: 'Highload v3 internal transfer', group: 'highload', source: 'highload-wallet-contract-v3', tlb: 'internal_transfer#ae42e5a4 query_id:uint64 actions:^OutList = InternalMsgBody;' },

  // Multisig v2
  { op: 0xf718510f, name: 'multisig_new_order', title: 'Multisig: new order', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0x9c73fba2, name: 'multisig_order_init', title: 'Multisig: order init', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0xa762230f, name: 'multisig_approve', title: 'Multisig: approve', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0x82609bf6, name: 'multisig_approve_accepted', title: 'Multisig: approve accepted', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0xafaf283e, name: 'multisig_approve_rejected', title: 'Multisig: approve rejected', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0x75097f5d, name: 'multisig_execute', title: 'Multisig: execute', group: 'multisig', source: 'multisig-contract-v2' },
  { op: 0xa32c59bf, name: 'multisig_execute_internal', title: 'Multisig: execute internal', group: 'multisig', source: 'multisig-contract-v2' },

  // Vesting wallet (ton-blockchain/vesting-contract)
  { op: 0x7258a69b, name: 'vesting_add_whitelist', title: 'Vesting: add whitelist', group: 'vesting', source: 'vesting-contract' },
  { op: 0xf258a69b, name: 'vesting_add_whitelist_response', title: 'Vesting: add whitelist response', group: 'vesting', source: 'vesting-contract' },
  { op: 0xa7733acd, name: 'vesting_send_message', title: 'Vesting: send message', group: 'vesting', source: 'vesting-contract' },
  { op: 0xf7733acd, name: 'vesting_send_message_response', title: 'Vesting: send message response', group: 'vesting', source: 'vesting-contract' }
]

const BY_OP = new Map(OPCODES.map(o => [o.op, o]))
const BY_NAME = new Map(OPCODES.map(o => [o.name, o]))

/** Looks up an op code (unsigned 32-bit). */
export function opcodeInfo(op: number): OpcodeInfo | undefined {
  return BY_OP.get(op >>> 0)
}

/** Op code by snake_case name, e.g. OP('jetton_transfer') === 0x0f8a7ea5. Throws on unknown names. */
export function OP(name: string): number {
  const info = BY_NAME.get(name)
  if (!info) throw new Error(`Unknown op name: ${name}`)
  return info.op
}

/** 0x0f8a7ea5 style, always 8 hex digits. */
export function opHex(op: number): string {
  return '0x' + (op >>> 0).toString(16).padStart(8, '0')
}

/** Parses "0x0f8a7ea5", "0f8a7ea5" or a signed/unsigned decimal string. Returns null when invalid. */
export function parseOp(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (/^0x[0-9a-f]{1,8}$/.test(s) || /^[0-9a-f]{8}$/.test(s)) return Number.parseInt(s.replace(/^0x/, ''), 16) >>> 0
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (n >= -0x80000000 && n <= 0xffffffff) return n >>> 0
  }
  return null
}
