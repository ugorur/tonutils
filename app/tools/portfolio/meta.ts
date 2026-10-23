import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'portfolio',
  name: 'Portfolio viewer',
  short: 'Total value of one or more TON wallets: GRAM, jettons and staking, in your currency.',
  description: 'See what one wallet or several together are worth: GRAM (formerly Toncoin), every jetton with its price and 24h / 7d / 30d change, and GRAM staked in nominator pools, in USD, EUR, TRY or 12 other currencies. Scam tokens are hidden and unverified ones are kept out of the total.',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['portfolio', 'net worth', 'total value', 'balance', 'jettons', 'tokens', 'staking', 'USD', 'fiat', 'price', 'multiple wallets', 'GRAM', 'Toncoin', 'tsTON', 'USDT'],
  related: ['account-overview', 'watchlist', 'bulk-balance-checker'],
  icon: 'i-lucide-chart-pie',
  featured: true
})
