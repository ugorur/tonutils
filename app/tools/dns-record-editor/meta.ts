import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-record-editor',
  name: 'Edit .ton domain records',
  short: 'Point your .ton domain to a wallet, a TON Site, a TON Storage bag or a subdomain resolver.',
  description: 'Shows the current DNS records of a .ton domain and lets its owner set, change or remove the wallet, TON Site (ADNL or TON Storage), storage bag and subdomain resolver records through TonConnect (TEP-81).',
  category: 'dns-domains',
  audience: 'user',
  network: 'wallet',
  keywords: ['dns record', 'edit', 'set wallet', 'link wallet', 'ton site', 'adnl', 'ton storage', 'bag id', 'next resolver', 'subdomain', 'change_dns_record', 'tep-81', '.ton', 'domain'],
  related: ['dns-lookup', 'dns-renew', 'adnl-address-converter', 'dns-reverse'],
  icon: 'i-lucide-file-pen-line'
})
