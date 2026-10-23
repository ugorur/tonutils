import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-deployer',
  name: 'Jetton deployer',
  short: 'Create your own TON token: name, symbol, logo and supply, deployed from your wallet.',
  description: 'Create a jetton (TON token) without code. Fill in the name, symbol, decimals, logo and initial supply, and your wallet deploys the standard Jetton 2.1 minter, the same contract minter.ton.org uses. Optionally renounce the admin for a fixed supply.',
  category: 'token-launch',
  audience: 'user',
  network: 'wallet',
  keywords: ['create token', 'create jetton', 'token generator', 'minter', 'mint', 'deploy jetton', 'launch token', 'meme coin', 'TEP-74', 'TEP-64', 'Jetton 2.0', 'GRAM', 'Toncoin'],
  related: ['jetton-admin-panel', 'holders-snapshot', 'token-list'],
  icon: 'i-lucide-rocket',
  featured: true
})
