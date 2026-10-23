import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'snake-string-codec',
  name: 'Snake string codec',
  short: 'Encode text or bytes into snake cells (comment, TEP-64 snake or chunked) and decode them back.',
  description: 'Turn long text or bytes into TON snake-format cells, as a text comment (0x00000000), TEP-64 snake data (0x00), chunked data (0x01) or raw, and decode any such BOC back to text. Shows how the data splits across cells.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['snake', 'snake format', 'string', 'text', 'comment', 'storeStringTail', 'loadStringTail', 'tep-64', 'chunked', 'metadata', 'on-chain metadata', 'utf-8', 'bytes', 'encode', 'decode'],
  related: ['cell-tree-viewer', 'boc-converter'],
  icon: 'i-lucide-whole-word'
})
