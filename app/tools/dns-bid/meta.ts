import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-bid',
  name: 'Bid on a .ton domain',
  short: 'Start an auction for a free .ton name, outbid the current leader, or claim an expired domain.',
  description: 'Checks a .ton name on chain and sends the right message from your wallet: open the auction for a free name at its minimum price, outbid the top bid by at least 5%, or release an expired domain into a new auction. Telegram usernames and +888 numbers are sold on Fragment instead.',
  category: 'dns-domains',
  audience: 'user',
  network: 'wallet',
  keywords: ['auction', 'bid', 'buy domain', 'register', 'mint', 'outbid', 'min bid', 'expired domain', 'release', 'dns_balance_release', '.ton', 'ton dns', 'dns.ton.org', 'gram', 'toncoin'],
  related: ['dns-bulk-availability', 'dns-lookup', 'dns-renew', 'dns-expiry-checker'],
  icon: 'i-lucide-gavel'
})
