import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'address-batch-converter',
  name: 'Bulk address converter',
  short: 'Convert, validate and deduplicate a whole list or CSV of TON addresses at once.',
  description: 'Paste a list or CSV of TON addresses (airdrop lists, payouts, allowlists) and get every row in raw, bounceable, non-bounceable and testnet forms, with invalid lines and duplicate accounts flagged. Export the result as CSV.',
  category: 'address',
  audience: 'dev',
  network: 'offline',
  keywords: ['bulk', 'batch', 'list', 'csv', 'airdrop', 'whitelist', 'allowlist', 'deduplicate', 'duplicates', 'validate', 'raw', 'EQ', 'UQ', 'bounceable', 'non-bounceable', 'export'],
  related: ['address-converter', 'address-compare'],
  icon: 'i-lucide-list-checks'
})
