import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'price-chart',
  name: 'Price chart',
  short: 'Price history of GRAM (formerly Toncoin) or any jetton in USD, EUR, GRAM and more.',
  description: 'Interactive price history for GRAM (formerly Toncoin) or any TON jetton, from 24 hours to all time, in 29 currencies or in GRAM. Shows high, low and change for the range and exports the data as CSV.',
  category: 'defi',
  audience: 'user',
  network: 'read',
  keywords: ['chart', 'price history', 'graph', 'gram price', 'toncoin price', 'ton price', 'jetton price', 'historical price', 'ohlc', 'trend', 'usd', 'csv'],
  related: ['price-converter', 'dex-pools', 'swap-quote'],
  icon: 'i-lucide-chart-line'
})
