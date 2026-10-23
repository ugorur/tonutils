// TON Enhancement Proposals, from github.com/ton-blockchain/TEPs README (read 2026-10-23) and each TEP's text.
// Getters and op codes are copied from the TEP text (TEP-81's change_dns_record comes from ton-blockchain/dns-contract); "Open PR" entries are not in the README.

export type TepStatus = 'Active' | 'Implemented' | 'Proposed' | 'Partially deployed' | 'Open PR'
export type TepType = 'Meta' | 'Core' | 'Contract Interface' | 'Infrastructure'

export interface Tep {
  num: number
  title: string
  type: TepType
  status: TepStatus
  /** dd.mm.yyyy as in the README */
  created: string
  url: string
  summary: string
  /** TL-B constructors with their op codes */
  ops?: string[]
  /** Get-method signatures as the TEP writes them */
  getters?: string[]
  /** TonUtils tools that work with this standard */
  tools?: string[]
  keywords?: string[]
}

const TEXT = (file: string) => `https://github.com/ton-blockchain/TEPs/blob/master/text/${file}.md`
const PR = (n: number) => `https://github.com/ton-blockchain/TEPs/pull/${n}`

export const TEPS: readonly Tep[] = [
  { num: 1, title: 'TEP Lifecycle', type: 'Meta', status: 'Active', created: '11.06.2022', url: TEXT('0001-tep-lifecycle'), summary: 'How proposals are submitted, discussed, merged and retired.' },
  { num: 2, title: 'TON Addresses', type: 'Core', status: 'Active', created: '07.09.2019', url: TEXT('0002-address'), summary: 'Raw (workchain:hex) and user-friendly base64 addresses: bounceable / non-bounceable and testnet flags, CRC16 checksum.', tools: ['address-converter', 'address-compare'], keywords: ['address', 'bounceable', 'EQ', 'UQ', 'base64', 'raw'] },
  { num: 3, title: 'TON Wallets and Sub-Wallets', type: 'Core', status: 'Active', created: '11.06.2026', url: TEXT('0003-wallets'), summary: 'Guideline for wallet apps: 12-word multichain or 24-word TON mnemonics, Wallet V5R1 by default, default subwallet ids (v3–v4: 0x29a9a317; v5: 0x7FFFFF11 mainnet, 0x7FFFFFFD testnet) and wallet discovery on import.', tools: ['mnemonic-to-addresses', 'wallet-version-detector', 'v5-wallet-id-calculator'], keywords: ['mnemonic', 'subwallet', 'wallet id', 'v5r1', 'w5', 'bip39'] },
  {
    num: 62, title: 'NFT Standard', type: 'Contract Interface', status: 'Active', created: '01.02.2022', url: TEXT('0062-nft-standard'),
    summary: 'Non-fungible tokens: one contract per item plus an optional collection. Defines transfer, ownership notifications and static data queries.',
    ops: ['transfer#5fcc3d14', 'ownership_assigned#05138d91', 'excesses#d53276db', 'get_static_data#2fcb26a2', 'report_static_data#8b771735'],
    getters: ['get_nft_data() → (int init?, int index, slice collection_address, slice owner_address, cell individual_content)', 'get_collection_data() → (int next_item_index, cell collection_content, slice owner_address)', 'get_nft_address_by_index(int index) → slice address', 'get_nft_content(int index, cell individual_content) → cell full_content'],
    tools: ['nft-viewer', 'nft-transfer-builder', 'nft-collection-info'], keywords: ['nft', 'collection', 'item']
  },
  { num: 64, title: 'Token Data Standard', type: 'Contract Interface', status: 'Active', created: '03.02.2022', url: TEXT('0064-token-data-standard'), summary: 'How NFT and jetton metadata is stored: on-chain (prefix 0x00, dictionary of sha256(key) → snake/chunked data) or off-chain (prefix 0x01 + URI to JSON). Lists the standard keys (name, description, image, decimals, symbol…).', tools: ['jetton-metadata-codec', 'nft-content-codec', 'metadata-validator', 'snake-string-codec'], keywords: ['metadata', 'content', 'onchain', 'offchain', 'snake', 'decimals'] },
  { num: 66, title: 'NFT Royalty Standard Extension', type: 'Contract Interface', status: 'Active', created: '12.02.2022', url: TEXT('0066-nft-royalty-standard'), summary: 'Lets marketplaces read the royalty share and recipient from an NFT collection.', ops: ['get_royalty_params#693d3950', 'report_royalty_params#a8cb00ad'], getters: ['royalty_params() → (int numerator, int denominator, slice destination)'], tools: ['nft-collection-info'], keywords: ['royalty', 'marketplace'] },
  {
    num: 74, title: 'Fungible tokens (Jettons) standard', type: 'Contract Interface', status: 'Active', created: '12.03.2022', url: TEXT('0074-jettons-standard'),
    summary: 'Jettons: a master (minter) contract plus one wallet contract per holder. Defines transfers with forward payloads, notifications, excesses and burns.',
    ops: ['transfer#0f8a7ea5', 'internal_transfer#178d4519', 'transfer_notification#7362d09c', 'excesses#d53276db', 'burn#595f07bc', 'burn_notification#7bdd97de'],
    getters: ['get_wallet_data() → (int balance, slice owner, slice jetton, cell jetton_wallet_code)', 'get_jetton_data() → (int total_supply, int mintable, slice admin_address, cell jetton_content, cell jetton_wallet_code)', 'get_wallet_address(slice owner_address) → slice jetton_wallet_address'],
    tools: ['jetton-info', 'jetton-transfer-builder', 'jetton-wallet-address-calculator', 'burn-jettons'], keywords: ['jetton', 'token', 'fungible', 'usdt', 'ft']
  },
  { num: 81, title: 'TON DNS Standard', type: 'Contract Interface', status: 'Active', created: '25.06.2022', url: TEXT('0081-dns-standard'), summary: 'Resolves names like test.ton to wallet addresses, ADNL addresses (TON Sites), storage bags and next resolvers, through the dnsresolve get-method.', ops: ['change_dns_record#4eb1f0f9 (reference dns-contract, not in the TEP text)'], getters: ['dnsresolve(slice subdomain, int category) → (int resolved_bits, cell result)'], tools: ['dns-lookup', 'dns-record-editor', 'dns-reverse'], keywords: ['dns', '.ton', 'domain', 'resolve', 'adnl'] },
  { num: 85, title: 'SBT Contract', type: 'Contract Interface', status: 'Active', created: '09.08.2022', url: TEXT('0085-sbt-standard'), summary: 'Soulbound tokens: NFTs that cannot be transferred, with optional revocation by an authority and on-chain ownership proofs.', ops: ['prove_ownership#04ded148', 'ownership_proof#0524c7ae', 'request_owner#d0c3bfea', 'owner_info#0dd607e3', 'destroy#1f04537a', 'revoke#6f89f5e3'], getters: ['get_nft_data() → same as TEP-62', 'get_authority_address() → slice', 'get_revoked_time() → int (0 if not revoked)'], keywords: ['sbt', 'soulbound', 'certificate'] },
  { num: 89, title: 'Discoverable Jettons Wallets', type: 'Contract Interface', status: 'Active', created: '08.09.2022', url: TEXT('0089-jetton-wallet-discovery'), summary: 'Adds an on-chain provide_wallet_address handler to jetton masters, so contracts can learn a jetton wallet address by message.', ops: ['provide_wallet_address#2c76b973', 'take_wallet_address#d1735400'], tools: ['jetton-wallet-address-calculator'], keywords: ['discovery', 'jetton wallet'] },
  { num: 91, title: 'Contract Source Registry', type: 'Infrastructure', status: 'Active', created: '09.09.2022', url: TEXT('0091-contract-source-registry'), summary: 'On-chain registry that links a contract code hash to verified source code.', tools: ['contract-source-verifier-lookup'], keywords: ['verify', 'source', 'verifier'] },
  { num: 115, title: 'TON Connect', type: 'Core', status: 'Active', created: '20.10.2022', url: TEXT('0115-ton-connect'), summary: 'Protocol between wallets and apps: bridge, manifest, connect requests, ton_proof, sendTransaction and signData.', tools: ['tonconnect-manifest-tool', 'tonconnect-link-decoder', 'ton-proof-verifier'], keywords: ['tonconnect', 'wallet connect', 'ton_proof', 'manifest', 'bridge'] },
  { num: 122, title: 'Onchain reveal mechanic', type: 'Contract Interface', status: 'Active', created: '31.10.2022', url: TEXT('0122-onchain-nft-reveal'), summary: 'Extends NFTs with an on-chain reveal: the item asks its collection for the final content.', ops: ['nft_reveal_user_request#5fcc3d1a', 'nft_reveal_nft_request#5fcc3d1b', 'nft_reveal_success_collection_response#5fcc3d1c', 'collection_add_reveal_batch#5fcc3d1d'], keywords: ['reveal', 'nft'] },
  { num: 126, title: 'Compressed NFT Standard', type: 'Contract Interface', status: 'Active', created: '28.07.2023', url: TEXT('0126-compressed-nft-standard'), summary: 'Collections that mint items cheaply: items are claimed later with a Merkle proof served by an off-chain API.', ops: ['claim#013a3ca6'], getters: ['get_nft_api_info() → (int version, cell uri)'], tools: ['merkle-proof-tool'], keywords: ['cnft', 'compressed', 'merkle'] },
  { num: 160, title: 'Dispatch Queue', type: 'Core', status: 'Implemented', created: '13.06.2024', url: TEXT('0160-dispatch-queue'), summary: 'An intermediate queue between contracts and the outbound message queue so one busy dApp cannot monopolise a shard.', keywords: ['queue', 'sharding', 'scheduling'] },
  { num: 467, title: 'Normalized Message Hash', type: 'Core', status: 'Active', created: '03.04.2025', url: TEXT('0467-normalized-message-hash'), summary: 'A hash of external-in messages that ignores fields not affecting validity, so a sent message can be tracked reliably (toncenter hash_norm).', tools: ['message-hash-tool', 'tx-lookup'], keywords: ['hash', 'normalized', 'external message', 'tracking'] },
  { num: 526, title: 'Scaled UI Jettons', type: 'Contract Interface', status: 'Active', created: '19.09.2025', url: TEXT('0526-scaled-ui-jettons'), summary: 'Jettons whose displayed balance is the on-chain balance × numerator / denominator (e.g. rebasing or share tokens).', ops: ['display_multiplier_changed#ac392598 (external out)'], getters: ['get_display_multiplier() → (int numerator, int denominator)'], keywords: ['scaled', 'rebase', 'multiplier'] },

  // Work in progress (README "WIP" table)
  { num: 92, title: 'Wallet Registry', type: 'Infrastructure', status: 'Proposed', created: '11.09.2022', url: PR(92), summary: 'A registry of wallet contract types.' },
  { num: 96, title: 'Dicts/Arrays in Metadata', type: 'Contract Interface', status: 'Proposed', created: '21.09.2022', url: PR(96), summary: 'Extends TEP-64 metadata with dictionaries and arrays.' },
  { num: 104, title: 'Data Signatures', type: 'Contract Interface', status: 'Proposed', created: '13.12.2022', url: PR(104), summary: 'A format for signing arbitrary data with wallet keys.', keywords: ['sign data'] },
  { num: 121, title: 'Lockable Jetton Wallet', type: 'Contract Interface', status: 'Proposed', created: '13.04.2023', url: PR(121), summary: 'Jetton wallets that can lock balances until a given time.' },
  { num: 127, title: 'TON Storage in Metadata', type: 'Contract Interface', status: 'Proposed', created: '23.09.2023', url: PR(127), summary: 'Referencing TON Storage bags from token metadata.' },
  { num: 130, title: 'Rebase Jettons standard', type: 'Contract Interface', status: 'Proposed', created: '04.12.2023', url: PR(130), summary: 'Jettons with rebasing supply.' },
  { num: 131, title: 'Referral code in Query ID', type: 'Contract Interface', status: 'Partially deployed', created: '26.12.2023', url: PR(131), summary: 'Encodes a referral code into the 64-bit query_id of messages.', tools: ['query-id-generator'], keywords: ['query_id', 'referral'] },
  { num: 137, title: 'Jetton Wallet Balance Query', type: 'Contract Interface', status: 'Proposed', created: '09.01.2024', url: PR(137), summary: 'On-chain request/response to read a jetton wallet balance.' },
  { num: 140, title: 'Programmable Action Phase', type: 'Core', status: 'Proposed', created: '20.01.2024', url: PR(140), summary: 'Lets contracts react programmatically to action phase results.' },
  { num: 141, title: 'Remote onchain execution', type: 'Core', status: 'Proposed', created: '20.01.2024', url: PR(141), summary: 'Running code of another contract on-chain.' },
  { num: 142, title: 'TBRC-20 Inscription Token Standard', type: 'Contract Interface', status: 'Proposed', created: '26.01.2024', url: PR(142), summary: 'Inscription-style tokens on TON.' },
  { num: 146, title: 'Semi-fungible token standard', type: 'Contract Interface', status: 'Proposed', created: '17.03.2024', url: PR(146), summary: 'Tokens between NFTs and jettons (several identical units per id).' },
  { num: 161, title: 'Proxy TON (wTON)', type: 'Contract Interface', status: 'Partially deployed', created: '13.06.2024', url: PR(161), summary: 'Wrapped native coin as a jetton, used by DEXes.', keywords: ['wton', 'pton', 'wrapped'] },
  { num: 176, title: 'Offchain custom payload for jetton transfers', type: 'Contract Interface', status: 'Open PR', created: '–', url: PR(176), summary: 'How a wallet fetches a custom_payload from an off-chain API before a jetton transfer. Used together with mintless jettons.', keywords: ['mintless', 'custom payload'] },
  { num: 177, title: 'Mintless jettons', type: 'Contract Interface', status: 'Open PR', created: '–', url: PR(177), summary: 'Jettons whose balances live in a Merkle tree and are claimed on first transfer, so airdrops cost no mint gas.', tools: ['mintless-claim', 'mintless-jetton-airdrop-builder'], keywords: ['mintless', 'airdrop', 'merkle'] }
]

export const STATUS_COLOR: Record<TepStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  'Active': 'success',
  'Implemented': 'success',
  'Partially deployed': 'info',
  'Proposed': 'warning',
  'Open PR': 'neutral'
}

/** Search by number ("74", "TEP-74", "tep74"), op code hex, getter name or words. */
export function searchTeps(query: string, opts: { merged?: boolean } = {}): Tep[] {
  const pool = opts.merged ? TEPS.filter(t => t.status === 'Active' || t.status === 'Implemented') : TEPS
  const q = query.trim().toLowerCase()
  if (!q) return [...pool]
  const num = /^(tep[-\s]?)?(\d{1,4})$/.exec(q)
  if (num) return pool.filter(t => t.num === Number(num[2]))
  const words = q.replace(/^0x/, '').split(/\s+/)
  return pool.filter((t) => {
    const hay = [t.title, t.type, t.status, t.summary, ...(t.ops ?? []), ...(t.getters ?? []), ...(t.keywords ?? [])].join(' ').toLowerCase()
    return words.every(w => hay.includes(w))
  })
}
