import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-lookup',
  name: 'TON DNS lookup',
  short: 'Check a .ton domain: free, in auction or owned, expiry date, owner and DNS records.',
  description: 'Look up any .ton domain straight from the blockchain: whether it is free (and the minimum bid), the live auction, or the owner and the date it expires. Shows the wallet, TON Site (ADNL), storage bag and resolver records plus the full bid history.',
  category: 'dns-domains',
  audience: 'user',
  network: 'read',
  keywords: ['ton dns', '.ton', 'domain', 'whois', 'availability', 'expiry', 'expiration', 'owner', 'resolve', 'adnl', 'ton site', 'storage bag', 'auction', 'bids', 'dns.ton.org'],
  related: ['dns-bid', 'dns-renew', 'dns-bulk-availability', 'dns-expiry-checker', 'dns-reverse', 'dns-auctions', 'adnl-address-converter'],
  icon: 'i-lucide-globe'
})
