import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'watchlist',
  name: 'Address watchlist',
  short: 'Save TON addresses with labels in your browser and see their balances and activity at a glance.',
  description: 'Keep a private list of TON addresses with your own labels, stored only in this browser. See each one\'s GRAM (formerly Toncoin) balance, what changed since your last visit and when it was last active, with optional auto-refresh.',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['watchlist', 'watch address', 'track wallet', 'monitor', 'balance', 'labels', 'address book', 'favorites', 'GRAM', 'Toncoin', 'last activity'],
  related: ['portfolio', 'bulk-balance-checker', 'account-overview'],
  icon: 'i-lucide-eye'
})
