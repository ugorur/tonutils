import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'supply-stats',
  name: 'GRAM supply and burn stats',
  short: 'Total and circulating GRAM supply, market cap, validator stake, issuance and fee burning.',
  description: 'Total and circulating supply of GRAM (formerly Toncoin), market cap and fully diluted value, how much is staked by validators or locked, how many new coins each block creates, and what share of fees the network burns, read live from CoinGecko and the TON config.',
  category: 'network-stats',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus CoinGecko for the price, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['supply', 'circulating supply', 'total supply', 'market cap', 'FDV', 'burn', 'burned', 'fee burning', 'inflation', 'issuance', 'tokenomics', 'GRAM', 'Toncoin', 'blackhole', 'config param 5'],
  related: ['rich-list', 'price-chart', 'whale-watch'],
  icon: 'i-lucide-flame'
})
