import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-bulk-availability',
  name: 'Bulk .ton domain availability',
  short: 'Paste up to 500 names and see which .ton domains are free, in auction or taken.',
  description: 'Check hundreds of .ton domain names at once, straight from the chain: free names with their minimum opening bid, live auctions with the current bid and end time, and taken names with owner and expiry. Export the result as CSV.',
  category: 'dns-domains',
  audience: 'user',
  network: 'read',
  keywords: ['ton dns', '.ton', 'domain', 'bulk', 'batch', 'availability', 'free domains', 'domain search', 'min price', 'auction', 'expired', 'csv'],
  related: ['dns-bid', 'dns-lookup', 'dns-auctions', 'dns-expiry-checker'],
  icon: 'i-lucide-list-checks'
})
