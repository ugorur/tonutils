import { defineLinkCategory } from '../types'
import { COIN_FORMER, COIN_NAME } from '../../utils/currency'

export default defineLinkCategory({
  id: 'analytics',
  title: 'Analytics & market data',
  description: 'Network stats, Dune dashboards, open datasets and price trackers.',
  icon: 'i-lucide-chart-line',
  order: 7,
  links: [
    { title: 'TON Stat', url: 'https://tonstat.com', description: 'Network statistics dashboard.', tags: ['stats'] },
    { title: 'Tonviewer stats', url: 'https://tonviewer.com/stats', description: 'Network statistics by Tonviewer.', tags: ['stats'] },
    { title: 'Dune: TON quick start', url: 'https://dune.com/ton_foundation/ton-quick-start', description: 'Dune dashboard introducing the TON datasets.', tags: ['dune'] },
    { title: 'Dune: Application activity', url: 'https://dune.com/ton_foundation/application-activity', description: 'Dune dashboard of app activity on TON.', tags: ['dune'] },
    { title: 'Dune: bridges', url: 'https://dune.com/ton_foundation/bridges', description: 'Dune dashboard tracking bridge flows into and out of TON.', tags: ['bridge', 'analytics'] },
    { title: 'Dune: Telegram Gifts', url: 'https://dune.com/rdmcd/telegram-gifts', description: 'Community Dune dashboard on Telegram gifts.', tags: ['dune', 'gifts'] },
    { title: 'TON on Dune docs', url: 'https://docs.dune.com/data-catalog/ton/transactions', description: 'Dune data catalog for TON tables.', tags: ['dune', 'docs'] },
    { title: 'Analytics docs', url: 'https://docs.ton.org/onboarding/analytics', description: 'Official overview of TON data and analytics sources.', tags: ['docs'] },
    { title: 'TON-ETL', url: 'https://github.com/ton-studio/ton-etl', description: 'ETL pipeline and public data lake for TON.', tags: ['etl', 'data'] },
    { title: 'TON Labels', url: 'https://github.com/ton-studio/ton-labels', description: 'Open dataset of labeled TON addresses.', tags: ['labels', 'data'] },
    { title: 'DefiLlama TON', url: 'https://defillama.com/chain/ton', description: 'TVL and DeFi metrics for TON.', tags: ['tvl'] },
    { title: `CoinGecko: ${COIN_NAME}`, url: 'https://www.coingecko.com/en/coins/gram', description: `Price and market data for ${COIN_NAME} (formerly ${COIN_FORMER}).`, tags: ['price'] },
    { title: `CoinMarketCap: ${COIN_NAME}`, url: 'https://coinmarketcap.com/currencies/gram/', description: `Price and market data for ${COIN_NAME} (formerly ${COIN_FORMER}).`, tags: ['price'] },
    { title: 'GeckoTerminal TON', url: 'https://www.geckoterminal.com/ton/pools', description: 'DEX pool charts and liquidity on TON.', tags: ['dex', 'price'] },
    { title: 'DEX Screener TON', url: 'https://dexscreener.com/ton', description: 'DEX pair charts on TON.', tags: ['dex', 'price'] }
  ]
})
