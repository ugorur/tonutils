import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'cell-layout-calculator',
  name: 'Cell layout calculator',
  short: 'Count the bits and refs of a cell layout, check the 1023-bit / 4-ref limits and estimate fees.',
  description: 'Declare fields (uintN, intN, coins, address, bool, Maybe ^Cell, dict…) and see how many bits and refs they need, whether they fit in one cell, a suggested split into ref cells, and what the cells cost in storage and forward fees at current mainnet prices.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['cell', 'layout', 'bits', 'refs', '1023 bits', '4 refs', 'bit budget', 'tl-b', 'storage', 'storage fee', 'forward fee', 'fwd fee', 'coins', 'varuint', 'address 267 bits', 'cell overflow', 'contract storage'],
  related: ['cell-tree-viewer', 'snake-string-codec', 'boc-converter'],
  icon: 'i-lucide-ruler'
})
