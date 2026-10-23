import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'ed25519-sign-verify',
  name: 'Ed25519 sign and verify',
  short: 'Sign data or a cell hash with an Ed25519 key, verify signatures and wallet messages.',
  description: 'Sign text, bytes or a cell hash with an Ed25519 private key or TON mnemonic, verify a signature against a public key, and check the signature inside a real wallet external message. Supports safeSign and L2 signature domains. Keys never leave your browser.',
  category: 'crypto-encoding',
  audience: 'dev',
  network: 'offline',
  keywords: ['ed25519', 'signature', 'sign', 'verify', 'public key', 'private key', 'secret key', 'nacl', 'tweetnacl', 'cell hash', 'safeSign', 'signature domain', 'global id', 'external message', 'wallet signature', 'mnemonic'],
  related: ['encoding-converter', 'hash-utilities', 'mnemonic-to-addresses', 'message-hash-tool', 'boc-converter'],
  icon: 'i-lucide-signature'
})
