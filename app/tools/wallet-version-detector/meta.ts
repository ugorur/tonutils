import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-version-detector',
  name: 'Wallet version detector',
  short: 'Which wallet contract is this? v1–v5 (W5), highload, vesting or multisig, plus seqno, key, wallet id',
  description: 'Paste a TON address, code hash or code BOC to identify the wallet contract version (v1R1 to W5 v5R1, highload v2/v3, vesting, multisig v2) and read its data: seqno, public key, subwallet or wallet id, plugins and W5 extensions. Includes the full table of known wallet code hashes.',
  category: 'wallet-keys',
  audience: 'both',
  network: 'read',
  keywords: ['wallet version', 'v3r2', 'v4r2', 'w5', 'v5r1', 'v5 beta', 'highload', 'vesting', 'multisig', 'code hash', 'wallet_id', 'subwallet', 'seqno', 'public key', 'extensions', 'plugins', 'library cell', 'wallet type'],
  related: ['wallet-version-scanner', 'wallet-address-from-pubkey', 'v5-wallet-id-calculator', 'highload-wallet-v3-tool', 'library-cell-resolver'],
  icon: 'i-lucide-scan-search'
})
