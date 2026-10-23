import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'v5-wallet-id-calculator',
  name: 'W5 wallet_id calculator',
  short: 'Build or decode a W5 (v5R1) wallet_id and v3/v4 subwallet_id, and see the address.',
  description: 'Encode and decode the wallet_id of TON W5 (wallet v5R1) wallets: network_global_id, workchain, version and subwallet number. Also shows v3/v4 subwallet_id defaults and the resulting address for a public key.',
  category: 'wallet-keys',
  audience: 'dev',
  network: 'offline',
  keywords: ['wallet_id', 'walletId', 'subwallet', 'subwallet_id', 'w5', 'v5r1', 'wallet v5', 'network_global_id', 'global id', '-239', '-3', '2147483409', '698983191', 'context'],
  related: ['wallet-address-from-pubkey', 'mnemonic-to-addresses'],
  icon: 'i-lucide-calculator'
})
