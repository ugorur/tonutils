import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dex-pools',
  name: 'DEX pool explorer',
  short: 'Find STON.fi and DeDust pools for any token: liquidity, volume, fees, APY, reserves.',
  description: 'Search STON.fi and DeDust liquidity pools by token name or jetton address. Compare liquidity, 24h volume and price, then open a pool for live reserves, LP fees and APY.',
  category: 'defi',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries tonapi plus the STON.fi and DexScreener APIs directly. Nothing you enter is stored.',
  keywords: ['dex', 'pool', 'liquidity', 'stonfi', 'ston.fi', 'dedust', 'tvl', 'apy', 'apr', 'lp', 'reserves', 'amm', 'volume', 'pair', 'yield'],
  related: ['swap-quote', 'price-chart', 'price-converter', 'jetton-info'],
  icon: 'i-lucide-droplets'
})
