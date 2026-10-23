import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'sign-message',
  name: 'Sign and verify a message',
  short: 'Prove you own a TON wallet: sign a text with your wallet, or verify someone else\'s signature.',
  description: 'Sign any text, bytes or cell with your wallet through TonConnect signData and get a shareable signature bundle that proves you own the address. Paste a bundle to verify it: the public key is read from the chain (or the wallet\'s StateInit) and the Ed25519 signature is checked in your browser.',
  category: 'wallet-actions',
  audience: 'both',
  network: 'wallet',
  keywords: ['sign message', 'verify signature', 'prove ownership', 'signData', 'tonconnect', 'ed25519', 'proof of ownership', 'sign text', 'signature bundle', 'ton_proof', 'authentication'],
  related: ['wallet-address-from-pubkey', 'wallet-version-detector', 'send-ton'],
  icon: 'i-lucide-signature'
})
