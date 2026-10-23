import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-address-from-pubkey',
  name: 'Wallet address from public key',
  short: 'Every TON wallet address (v1–W5) a public key controls, with optional balance check.',
  description: 'Compute the TON wallet addresses for a public key across all wallet versions (v1R1 to W5 v5R1), mainnet or testnet, basechain or masterchain, with custom subwallet ids. Runs locally; balances are checked only when you ask.',
  category: 'wallet-keys',
  audience: 'both',
  network: 'offline',
  keywords: ['public key', 'pubkey', 'ed25519', 'wallet address', 'derive address', 'v3r2', 'v4r2', 'v5r1', 'w5', 'subwallet', 'wallet_id', 'state init', 'which wallet version'],
  related: ['mnemonic-to-addresses', 'v5-wallet-id-calculator', 'address-converter'],
  icon: 'i-lucide-fingerprint'
})
