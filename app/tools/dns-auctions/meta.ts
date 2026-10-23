import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-auctions',
  name: 'Live DNS auctions',
  short: 'Every running .ton domain and Telegram username auction with current bid and time left.',
  description: 'Browse all live .ton domain auctions and .t.me username auctions: current bid, number of bids and time left. Filter by length or keyword, sort by ending soon or price, then bid on .ton names right here or on usernames at Fragment.',
  category: 'dns-domains',
  audience: 'user',
  network: 'read',
  keywords: ['ton dns', 'auction', '.ton', '.t.me', 'telegram username', 'fragment', 'bid', 'ending soon', 'domain market', 'short domains', 'dns.ton.org'],
  related: ['dns-bid', 'dns-lookup', 'dns-bulk-availability'],
  icon: 'i-lucide-gavel'
})
