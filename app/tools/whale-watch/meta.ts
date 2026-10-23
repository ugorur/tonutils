import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'whale-watch',
  name: 'Whale watch',
  short: 'Live feed of large GRAM and USD₮ transfers on TON, with exchange and known-entity labels.',
  description: 'A live feed of big GRAM (formerly Toncoin) and USD₮ transfers on the TON network above the threshold you choose, labelled with exchanges and other known accounts. Updates every few seconds straight from the public toncenter indexer.',
  category: 'network-stats',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus CoinGecko for the price, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['whale', 'whale alert', 'large transfers', 'big transactions', 'live feed', 'exchange flows', 'USDT', 'USD₮', 'GRAM', 'Toncoin', 'TON', 'Binance', 'OKX', 'Bybit', 'monitor'],
  related: ['rich-list', 'tx-history', 'account-overview'],
  icon: 'i-lucide-fish'
})
