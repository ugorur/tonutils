import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-admin-panel',
  name: 'Jetton admin panel',
  short: 'Mint more, hand over or renounce admin, and edit metadata of a jetton you control.',
  description: 'Manage a jetton you are the admin of: mint more tokens, change or claim the admin, renounce it for a fixed supply, and update the name, symbol, logo or metadata link. Detects the minter type (Jetton 2.1, 2.0, stablecoin or the classic minter) and only offers what it supports.',
  category: 'token-launch',
  audience: 'both',
  network: 'wallet',
  keywords: ['jetton admin', 'mint', 'change admin', 'claim admin', 'renounce', 'revoke ownership', 'drop admin', 'change metadata', 'token logo', 'minter', 'TEP-74'],
  related: ['jetton-deployer', 'holders-snapshot', 'token-list'],
  icon: 'i-lucide-crown'
})
