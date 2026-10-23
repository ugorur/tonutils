import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tlb-playground',
  name: 'TL-B playground',
  short: 'Decode any cell with a TL-B schema into JSON, edit it, and encode it back to a BOC.',
  description: 'Paste a TL-B schema (or pick TEP-74, TEP-62, TEP-64, W5 or the full block.tlb) and a BOC to see it decoded as JSON, then edit the JSON and serialize it back to a cell. Runs entirely in your browser.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['tl-b', 'tlb', 'schema', 'deserialize', 'serialize', 'decode', 'encode', 'boc', 'cell', 'block.tlb', 'tep-74', 'tep-62', 'tep-64', 'w5', 'stateinit', 'json'],
  related: ['tlb-codegen', 'tlb-opcode-crc32', 'boc-converter', 'cell-tree-viewer'],
  icon: 'i-lucide-braces'
})
