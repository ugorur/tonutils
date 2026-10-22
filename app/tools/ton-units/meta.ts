import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'ton-units',
  name: 'GRAM ⇄ nanoGRAM',
  short: 'Convert GRAM (formerly Toncoin) to nanoGRAM (nanoTON) and back with exact math.',
  description: 'Convert GRAM to nanoGRAM and back without rounding errors. 1 GRAM (formerly Toncoin) is 1,000,000,000 nanoGRAM, also called nanoTON; contracts and APIs always use the nano amount.',
  category: 'units-format',
  audience: 'both',
  network: 'offline',
  keywords: ['gram', 'nanogram', 'toncoin', 'ton', 'nano', 'nanoton', 'nanotons', 'toNano', 'fromNano', 'amount', 'decimals', 'convert', 'unit', 'coins', 'grams'],
  related: ['address-converter'],
  icon: 'i-lucide-scale',
  featured: true
})
