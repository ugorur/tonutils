import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'adnl-address-converter',
  name: 'ADNL address converter',
  short: 'Convert ADNL addresses between hex, base64 and the 55-character .adnl form.',
  description: 'Convert a TON ADNL address (TON Sites, DNS site records, TON Storage, proxies) between 64-character hex, base64 and the 55-character .adnl user form, with checksum validation.',
  category: 'address',
  audience: 'dev',
  network: 'offline',
  keywords: ['adnl', '.adnl', 'ton site', 'ton sites', 'dns', 'site record', 'rldp', 'proxy', 'storage', 'base32', 'hex', 'node id', 'dns_site_adnl'],
  related: ['address-converter'],
  icon: 'i-lucide-network'
})
