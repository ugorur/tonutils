import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-reverse',
  name: 'Reverse DNS lookup',
  short: 'Find the .ton domains and Telegram usernames that point to or belong to an address.',
  description: 'Enter a TON address to see its primary name, every .ton domain whose wallet record points to it (and who controls each one), and the .ton domains and .t.me usernames it owns.',
  category: 'dns-domains',
  audience: 'user',
  network: 'read',
  keywords: ['reverse dns', 'reverse lookup', 'address to domain', 'ton dns', '.ton', '.t.me', 'telegram username', 'fragment', 'primary name', 'backresolve', 'whois'],
  related: ['dns-lookup', 'dns-expiry-checker', 'account-overview'],
  icon: 'i-lucide-arrow-left-right'
})
