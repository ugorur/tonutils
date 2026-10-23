import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'verify-signature',
  name: 'Verify a signed message',
  short: 'Check that a TON wallet really signed a message: signData, ton_proof or raw Ed25519.',
  description: 'Paste a signature someone shared to prove they own a TON wallet: a TonConnect signData bundle, a ton_proof login result, or a raw message, signature and public key. The wallet key is taken from the StateInit or read from the chain, and the Ed25519 signature is checked in your browser.',
  category: 'security',
  audience: 'both',
  network: 'read',
  keywords: ['verify signature', 'signed message', 'proof of ownership', 'prove wallet', 'signData', 'sign data', 'ton_proof', 'ed25519', 'public key', 'signature check', 'tonconnect', 'authenticity', 'scam check', 'otc'],
  related: ['sign-message', 'ton-proof-verifier', 'wallet-address-from-pubkey', 'tonconnect-link-decoder'],
  icon: 'i-lucide-badge-check'
})
