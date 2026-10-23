import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'mnemonic-checker',
  name: 'Mnemonic checker (TON vs BIP39)',
  short: 'Is your seed phrase a TON mnemonic, a BIP39 one, both or neither? Typos flagged.',
  description: 'Check a seed phrase offline: valid TON mnemonic, password-protected TON mnemonic, BIP39 (Trust Wallet, Ledger), both or neither. Misspelled words are flagged with suggestions, and you learn which wallet can restore it.',
  category: 'wallet-keys',
  audience: 'both',
  network: 'offline',
  keywords: ['mnemonic', 'seed phrase', 'validate', 'checker', 'bip39', 'checksum', 'typo', 'invalid seed phrase', 'recovery phrase', '12 words', '24 words', 'mnemonic password', 'wordlist'],
  related: ['mnemonic-to-addresses', 'bip39-ton-derivation', 'mnemonic-generator'],
  icon: 'i-lucide-spell-check'
})
