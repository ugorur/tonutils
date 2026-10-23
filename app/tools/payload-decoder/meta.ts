import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'payload-decoder',
  name: 'Message body decoder',
  short: 'Decode any message body or transaction: jettons, NFTs, comments, W5/v4/highload wallet requests',
  description: 'Paste a message body BOC, a full message or a transaction hash and see what it does: the op code is detected and every field is decoded, including wallet requests (W5, v4, v3, highload v3) with each outgoing message, nested jetton forward payloads and bounced messages. Decoding runs in your browser; unknown op codes can be sent to toncenter for a second opinion.',
  category: 'transactions',
  audience: 'both',
  network: 'read',
  keywords: ['payload decoder', 'message body', 'decode boc', 'op code', 'opcode', 'jetton transfer', 'nft transfer', 'w5', 'wallet v5', 'wallet v4', 'highload', 'bounce', 'forward payload', 'out actions', 'tonviewer decode', 'internal message', 'external message', 'transaction hash'],
  related: ['comment-payload-builder', 'wallet-v5-actions-builder', 'internal-message-builder', 'cell-tree-viewer', 'tx-lookup', 'message-hash-tool'],
  icon: 'i-lucide-scan-text',
  featured: true
})
