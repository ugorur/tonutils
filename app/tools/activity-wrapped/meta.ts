import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'activity-wrapped',
  name: 'TON Wrapped: wallet year in review',
  short: 'A shareable card of any wallet\'s year on TON: volume, fees, swaps, NFTs, top tokens and contacts.',
  description: `Your year on the TON network in one shareable card: actions, ${COIN_SYMBOL} (formerly ${COIN_FORMER}) received and sent, fees paid, swaps, NFTs bought, top tokens, top counterparties and your busiest day. Download it as a PNG.`,
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['wrapped', 'year in review', 'recap', 'summary', 'statistics', 'stats', 'share', 'card', 'png', 'activity', 'volume', 'fees', 'swaps', 'nft', 'gram', 'toncoin'],
  related: ['balance-diff', 'tx-history', 'portfolio'],
  icon: 'i-lucide-party-popper'
})
