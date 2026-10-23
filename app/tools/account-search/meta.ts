import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'account-search',
  name: 'Name and service search',
  short: 'Find the verified TON address of an exchange, service, token or .ton name before you send.',
  description: 'Search TON accounts by name: exchanges, services, jettons, NFT collections and .ton / .t.me names. Verified entries are listed first and lookalike names are flagged, so you can check an address before sending GRAM (formerly Toncoin).',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['search', 'find address', 'name', 'exchange', 'deposit address', 'service', 'verified', 'scam', 'impersonation', '.ton', 't.me', 'dns', 'jetton', 'Binance', 'Fragment'],
  related: ['account-overview', 'watchlist', 'address-converter'],
  icon: 'i-lucide-text-search'
})
