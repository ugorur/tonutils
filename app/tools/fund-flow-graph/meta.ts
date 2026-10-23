import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'fund-flow-graph',
  name: 'Fund flow graph',
  short: 'Map who sent what to whom around an address, hop by hop, to trace funds to an exchange.',
  description: `An interactive graph of ${COIN_SYMBOL} (formerly ${COIN_FORMER}), jetton and NFT flows around any TON address. Expand counterparties hop by hop, spot exchanges and scam-flagged accounts, filter by date and export the flows as CSV.`,
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['fund flow', 'graph', 'trace', 'investigation', 'stolen funds', 'hack', 'scam', 'exchange', 'counterparties', 'follow the money', 'transfers', 'network', 'visualize', 'gram', 'toncoin', 'usdt'],
  related: ['tx-history', 'activity-wrapped', 'account-overview'],
  icon: 'i-lucide-waypoints'
})
