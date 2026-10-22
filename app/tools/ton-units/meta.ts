import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'ton-units',
  name: 'TON ⇄ nanoTON',
  short: 'Convert between TON and nanoTON with exact integer math.',
  description: 'Convert TON to nanoTON and back without rounding errors. 1 TON is 1,000,000,000 nanoTON; contracts and APIs always use nanoTON.',
  category: 'units-format',
  audience: 'both',
  network: 'offline',
  keywords: ['nano', 'nanoton', 'nanotons', 'toNano', 'fromNano', 'amount', 'decimals', 'convert', 'unit', 'coins', 'grams'],
  related: ['address-converter'],
  icon: 'i-lucide-scale',
  featured: true
})
