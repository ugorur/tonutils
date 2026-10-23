import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'price-converter',
  name: 'GRAM & jetton price converter',
  short: 'Convert GRAM (formerly Toncoin), any jetton and 29 fiat currencies at live rates.',
  description: 'Convert between GRAM (formerly Toncoin), any TON jetton and fiat currencies like USD, EUR or TRY at live market rates, with 24h, 7d and 30d price changes. Rates come from tonapi.io.',
  category: 'defi',
  audience: 'user',
  network: 'read',
  keywords: ['price', 'rate', 'exchange rate', 'gram price', 'toncoin price', 'ton price', 'ton to usd', 'gram to usd', 'usdt', 'jetton price', 'fiat', 'eur', 'try', 'rub', 'calculator', 'converter', 'market'],
  related: ['price-chart', 'swap-quote', 'ton-units', 'dex-pools'],
  icon: 'i-lucide-arrow-right-left'
})
