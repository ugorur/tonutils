import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'gram-rebrand-explainer',
  name: 'Toncoin → Gram rename explained',
  short: 'Toncoin is now Gram (GRAM). Same coin, same network, nothing to migrate. Spot rename scams.',
  description: 'Toncoin was renamed Gram (GRAM) on 2026-06-15: only the name and ticker changed, the network is still TON and no migration or swap is needed. Check a suspicious "migrate TON to GRAM" message and find the new exchange tickers.',
  category: 'reference',
  audience: 'user',
  network: 'offline',
  keywords: ['gram', 'toncoin', 'rename', 'rebrand', 'ticker', 'GRAMUSDT', 'migration', 'migrate', 'swap ton to gram', 'scam', 'airdrop', 'TON to GRAM', 'nanoton', 'nanogram'],
  related: ['ton-units', 'scam-checker', 'safe-to-send', 'price-converter'],
  icon: 'i-lucide-badge-info',
  featured: true
})
