import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-holders',
  name: 'Jetton top holders',
  short: 'Biggest holders of a TON token, their share of supply and how concentrated it is.',
  description: 'See the top holders of any jetton (TON token) with their share of the total supply, labels for exchanges, contracts and burn addresses, and a concentration score based on the top 10 holders. Export the list as CSV.',
  category: 'jettons',
  audience: 'user',
  network: 'read',
  keywords: ['jetton', 'token', 'holders', 'top holders', 'whales', 'distribution', 'concentration', 'rich list', 'supply share', 'USDT', 'NOT', 'DOGS', 'CSV'],
  related: ['jetton-info', 'jetton-history', 'jetton-wallet-status'],
  icon: 'i-lucide-users'
})
