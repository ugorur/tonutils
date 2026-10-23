import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'rich-list',
  name: 'Rich list',
  short: 'The TON accounts holding the most GRAM, with names, account type and share of supply.',
  description: 'The top TON accounts by GRAM (formerly Toncoin) balance, with known names (exchanges, foundations, system contracts), account type and their share of the total supply. Page through the list and export it as CSV.',
  category: 'network-stats',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus CoinGecko for the price, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['rich list', 'top accounts', 'top holders', 'largest wallets', 'whales', 'distribution', 'richest', 'GRAM', 'Toncoin', 'balance ranking', 'leaderboard'],
  related: ['whale-watch', 'supply-stats', 'account-overview'],
  icon: 'i-lucide-crown'
})
