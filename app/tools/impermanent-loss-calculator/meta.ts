import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'impermanent-loss-calculator',
  name: 'Impermanent loss calculator',
  short: 'How much a STON.fi or DeDust liquidity position loses versus simply holding the two tokens.',
  description: 'Enter the entry and current prices of the two tokens in a pool and see the impermanent loss versus holding, the token amounts you now own, and the fees needed to break even. Works for 50/50 constant-product pools (STON.fi, DeDust volatile); stable pools are only approximated.',
  category: 'defi',
  audience: 'user',
  network: 'offline',
  keywords: ['impermanent loss', 'IL', 'divergence loss', 'liquidity pool', 'LP', 'liquidity provider', 'STON.fi', 'DeDust', 'AMM', 'x*y=k', 'constant product', 'yield farming', 'calculator'],
  related: ['lp-position-viewer', 'dex-pools', 'swap-quote'],
  icon: 'i-lucide-trending-down'
})
