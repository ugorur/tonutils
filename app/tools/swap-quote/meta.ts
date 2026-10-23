import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'swap-quote',
  name: 'Swap quote comparison',
  short: 'Compare swap quotes on STON.fi, DeDust and the swap.coffee aggregator before you trade.',
  description: 'See how much you would get for a token swap on STON.fi, DeDust and the swap.coffee aggregator side by side: output, minimum received, price impact, fees and route. DeDust quotes are re-priced with live on-chain reserves.',
  category: 'defi',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries tonapi plus the STON.fi, DeDust and swap.coffee APIs directly. Nothing you enter is stored.',
  keywords: ['swap', 'quote', 'price impact', 'slippage', 'stonfi', 'ston.fi', 'dedust', 'swap.coffee', 'aggregator', 'best rate', 'dex', 'exchange', 'trade', 'min received'],
  related: ['swap', 'dex-pools', 'price-converter'],
  icon: 'i-lucide-git-compare-arrows'
})
