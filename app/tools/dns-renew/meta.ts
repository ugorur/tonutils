import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-renew',
  name: 'Renew .ton domains',
  short: 'Renew one or all of your .ton domains for another year in a single wallet transaction.',
  description: 'Lists the .ton domains your wallet owns with their expiry dates and renews the ones you pick through TonConnect, several per transaction. A domain not renewed for a year can be released and auctioned by anyone.',
  category: 'dns-domains',
  audience: 'user',
  network: 'wallet',
  keywords: ['renew', 'extend', 'prolong', 'expiry', 'expire', 'expiring', 'ton dns', '.ton', 'domain', 'bulk renew', 'last fill up', 'dns.ton.org', 'gram', 'toncoin'],
  related: ['dns-expiry-checker', 'dns-record-editor', 'dns-lookup', 'dns-bid'],
  icon: 'i-lucide-calendar-sync'
})
