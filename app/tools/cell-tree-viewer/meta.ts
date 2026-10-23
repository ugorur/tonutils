import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'cell-tree-viewer',
  name: 'Cell tree viewer',
  short: 'Explore a BOC as a tree: every cell\'s bits, refs, type, level, depth and hashes.',
  description: 'Paste a bag of cells and browse it as an interactive tree. See each cell\'s data in hex and binary, its refs, type (ordinary, pruned branch, library, Merkle proof or update), level, depth and per-level hashes, spot shared cells and copy any sub-cell as its own BOC.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['cell', 'boc', 'tree', 'viewer', 'explorer', 'refs', 'exotic', 'pruned branch', 'merkle proof', 'merkle update', 'library cell', 'cell hash', 'level', 'depth', 'fift', 'x{}'],
  related: ['boc-converter', 'snake-string-codec', 'message-hash-tool'],
  icon: 'i-lucide-list-tree'
})
