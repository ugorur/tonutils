import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'internal-message-builder',
  name: 'Internal message builder',
  short: 'Compose an internal message (destination, value, bounce, body, StateInit) and export or send it.',
  description: 'Compose a full internal message: destination, value, bounce flag, body (comment or any BOC) and an optional StateInit to deploy a contract. Get the MessageRelaxed BOC, the TonConnect JSON and a ton:// link with QR code, then send it from your own wallet through TonConnect.',
  category: 'transactions',
  audience: 'dev',
  network: 'wallet',
  keywords: ['internal message', 'message builder', 'MessageRelaxed', 'tonconnect', 'sendTransaction', 'state init', 'deploy contract', 'bounce', 'send mode', 'ton://transfer', 'deeplink', 'payload', 'raw transaction'],
  related: ['payload-decoder', 'comment-payload-builder', 'wallet-v5-actions-builder', 'contract-address-from-stateinit', 'message-hash-tool'],
  icon: 'i-lucide-mail-plus'
})
