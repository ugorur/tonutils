import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'bulk-balance-checker',
  name: 'Bulk balance checker',
  short: 'Paste up to 1,000 addresses or a CSV: GRAM balance, status, wallet type and a jetton balance each.',
  description: 'Check many TON accounts at once. Paste addresses or .ton names, or drop a CSV, and get each account\'s GRAM (formerly Toncoin) balance, status, wallet version, last activity and, optionally, one jetton balance such as USD₮. Export the table to CSV.',
  category: 'explorer-lookup',
  audience: 'both',
  network: 'read',
  keywords: ['bulk', 'batch', 'multiple addresses', 'balances', 'csv', 'airdrop', 'list', 'multi balance', 'jetton balance', 'USDT', 'export', 'GRAM', 'Toncoin'],
  related: ['portfolio', 'watchlist', 'account-overview'],
  icon: 'i-lucide-sheet'
})
