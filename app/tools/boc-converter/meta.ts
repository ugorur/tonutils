import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'boc-converter',
  name: 'BOC converter',
  short: 'Convert a bag of cells between base64, base64url, hex and .boc files, and inspect its header.',
  description: 'Convert a TON bag of cells (BOC) between base64, base64url, hex and a binary .boc file. See the header flags, root and cell counts and hashes, and re-serialize with or without the index and CRC32C checksum.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['boc', 'bag of cells', 'cell', 'base64', 'hex', 'base64url', 'te6cc', 'b5ee9c72', 'crc32c', 'serialize', 'deserialize', '.boc file', 'convert'],
  related: ['cell-tree-viewer', 'message-hash-tool', 'snake-string-codec'],
  icon: 'i-lucide-file-cog'
})
