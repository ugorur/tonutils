import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'address-compare',
  name: 'Address compare (anti-poisoning)',
  short: 'Check if two TON addresses are the same account and catch look-alike poisoning scams.',
  description: 'Paste two TON addresses in any format to see whether they are the same account, which characters differ, and whether one is a look-alike made for an address poisoning scam.',
  category: 'security',
  audience: 'user',
  network: 'offline',
  keywords: ['compare', 'same', 'equal', 'match', 'diff', 'poisoning', 'address poisoning', 'look-alike', 'lookalike', 'scam', 'fake address', 'vanity', 'verify', 'check address'],
  related: ['address-converter', 'address-batch-converter'],
  icon: 'i-lucide-git-compare'
})
