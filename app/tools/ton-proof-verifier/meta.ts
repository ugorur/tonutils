import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'ton-proof-verifier',
  name: 'TonConnect ton_proof verifier',
  short: 'Debug TonConnect login: verify a ton_proof step by step and see every byte and hash.',
  description: 'Paste the connect result your dApp received (address, walletStateInit or public key, and the ton_proof). The tool rebuilds the signed message byte by byte, shows each intermediate SHA-256, finds the wallet key from the StateInit or the chain, verifies the Ed25519 signature and runs the domain, payload and freshness checks your backend must do.',
  category: 'security',
  audience: 'dev',
  network: 'read',
  keywords: ['ton_proof', 'tonproof', 'ton-proof-item-v2', 'tonconnect', 'ton connect', 'login', 'authentication', 'auth', 'backend', 'check proof', 'walletStateInit', 'signature', 'ed25519', 'sign in with ton', 'nonce', 'payload'],
  related: ['verify-signature', 'tonconnect-link-decoder', 'sign-message', 'contract-address-from-stateinit'],
  icon: 'i-lucide-key-round'
})
