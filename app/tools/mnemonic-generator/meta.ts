import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'mnemonic-generator',
  name: 'Mnemonic generator',
  short: 'Create a 24-word TON seed phrase, its keys and wallet addresses, offline.',
  description: 'Generate a new 24-word TON mnemonic in your browser and see the key pair and wallet addresses it controls (v3R2, v4R2, v5R1) on mainnet and testnet. Nothing is sent or stored.',
  category: 'wallet-keys',
  audience: 'both',
  network: 'offline',
  keywords: ['seed', 'seed phrase', 'mnemonic', 'recovery phrase', '24 words', 'private key', 'public key', 'keypair', 'wallet', 'v3r2', 'v4r2', 'v5r1', 'w5', 'create wallet', 'generate'],
  related: ['address-converter'],
  icon: 'i-lucide-key-round',
  featured: true
})
