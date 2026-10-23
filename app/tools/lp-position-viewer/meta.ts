import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'lp-position-viewer',
  name: 'LP positions viewer',
  short: 'A wallet’s STON.fi and DeDust liquidity: underlying tokens, pool share, value and farm stakes.',
  description: 'Paste a TON wallet to see every STON.fi and DeDust liquidity position it holds: the tokens you would get back, your share of each pool, the current USD value, and LP tokens staked in STON.fi farms with unclaimed rewards.',
  category: 'defi',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus the STON.fi and CoinGecko APIs, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['LP', 'liquidity', 'liquidity position', 'pool share', 'LP token', 'STON.fi', 'DeDust', 'farm', 'yield farming', 'staked LP', 'rewards', 'DeFi portfolio', 'provide liquidity'],
  related: ['impermanent-loss-calculator', 'dex-pools', 'portfolio'],
  icon: 'i-lucide-droplets'
})
