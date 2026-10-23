import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-version-scanner',
  name: 'Find my other wallet versions',
  short: 'Lost funds after a wallet upgrade? See every wallet version your key controls, with balances.',
  description: 'Enter a wallet address or public key to list every standard wallet contract (v1 to W5) the same key controls, with GRAM balance, jettons and NFTs on each. Finds funds left in an old version after a wallet app switched you to W5, or sent to a version you never opened.',
  category: 'wallet-keys',
  audience: 'user',
  network: 'read',
  keywords: ['lost funds', 'missing balance', 'other versions', 'w5', 'v4r2', 'v3r2', 'tonkeeper', 'wallet upgrade', 'public key', 'same seed', 'old wallet', 'find wallet', 'toncoin', 'jettons', 'nft'],
  related: ['wallet-version-detector', 'wallet-address-from-pubkey', 'mnemonic-to-addresses', 'account-overview'],
  icon: 'i-lucide-search-check'
})
