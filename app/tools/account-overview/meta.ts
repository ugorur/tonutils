import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'account-overview',
  name: 'Account overview',
  short: 'Balance, wallet type, last activity, domains, tokens and scam flags for any TON address or .ton name',
  description: 'Look up any TON address or .ton / .t.me name: GRAM (formerly Toncoin) balance with fiat value, account status, wallet version, seqno, last activity, linked domains, jetton and NFT counts, and scam or memo warnings.',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['balance', 'wallet', 'account', 'lookup', 'explorer', 'seqno', 'wallet version', 'last activity', 'scam', 'memo', '.ton', 't.me', 'dns', 'Toncoin', 'GRAM', 'check address'],
  related: ['portfolio', 'account-search', 'watchlist', 'address-converter'],
  icon: 'i-lucide-user-round-search',
  featured: true
})
