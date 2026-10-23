import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'bip39-ton-derivation',
  name: 'BIP39 phrase to TON address',
  short: 'Find the TON wallets behind a Trust Wallet or Ledger (BIP39) seed phrase, offline.',
  description: 'Derive TON keys and wallet addresses from a 12 to 24-word BIP39 phrase along the Trust Wallet (m/44\'/607\'/0\') and Ledger paths or a custom SLIP-10 path, then check balances. Recovers TON funds that look missing in TON-only apps.',
  category: 'wallet-keys',
  audience: 'user',
  network: 'offline',
  keywords: ['bip39', 'bip44', 'slip-10', 'slip10', 'derivation path', "m/44'/607'", 'trust wallet', 'ledger', 'multichain wallet', '12 words', 'passphrase', 'recover funds', 'missing ton', 'ed25519'],
  related: ['mnemonic-checker', 'mnemonic-to-addresses', 'wallet-address-from-pubkey'],
  icon: 'i-lucide-route'
})
