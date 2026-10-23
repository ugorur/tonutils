import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-v5-actions-builder',
  name: 'Wallet V5 actions builder',
  short: 'Build and decode W5 wallet requests: batched transfers, add/remove extension, signature on/off.',
  description: 'Build the body a W5 (wallet v5r1) wallet signs: up to 255 outgoing messages with send modes, plus extension actions (add or remove an extension, allow or disallow signature auth), for external, internal or extension auth. Get the exact bytes and hash to sign, assemble the signed body and external message, or paste an existing W5 body to see every action.',
  category: 'transactions',
  audience: 'dev',
  network: 'offline',
  keywords: ['w5', 'wallet v5', 'v5r1', 'out actions', 'action list', 'extension', 'add extension', 'remove extension', 'signature allowed', 'batch transfer', 'wallet_id', 'signed request', 'external message', 'gasless', 'internal_signed'],
  related: ['payload-decoder', 'internal-message-builder', 'v5-wallet-id-calculator', 'message-hash-tool'],
  icon: 'i-lucide-list-tree'
})
