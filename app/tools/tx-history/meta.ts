import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tx-history',
  name: 'Transaction history',
  short: 'Any wallet\'s history in plain language, with filters by type and token.',
  description: 'Read any TON wallet\'s history in plain language: "Sent 10 USD₮", "Swapped on STON.fi", "Received an NFT". Filter by type and token, hide spam, and keep scrolling back in time.',
  category: 'transactions',
  audience: 'user',
  network: 'read',
  keywords: ['history', 'activity', 'transactions', 'wallet history', 'transfers', 'jettons', 'usdt', 'swaps', 'nft', 'comments', 'spam', 'gram', 'toncoin'],
  related: ['history-csv-export', 'tx-lookup', 'tx-receipt'],
  icon: 'i-lucide-history'
})
