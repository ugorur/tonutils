import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'mnemonic-to-addresses',
  name: 'Seed phrase to wallet addresses',
  short: 'See the keys and every wallet address (v1–W5) behind a 24-word TON seed phrase.',
  description: 'Enter a 24-word TON mnemonic (with or without password) to see its key pair and the addresses of every wallet version on mainnet or testnet, then check which one holds funds. The phrase never leaves your browser.',
  category: 'wallet-keys',
  audience: 'both',
  network: 'offline',
  keywords: ['mnemonic', 'seed phrase', 'recovery phrase', '24 words', 'restore wallet', 'missing funds', 'wallet version', 'v3r2', 'v4r2', 'v5r1', 'w5', 'public key', 'private key', 'mnemonic password', 'subwallet'],
  related: ['mnemonic-checker', 'bip39-ton-derivation', 'wallet-address-from-pubkey', 'mnemonic-generator'],
  icon: 'i-lucide-list-tree'
})
