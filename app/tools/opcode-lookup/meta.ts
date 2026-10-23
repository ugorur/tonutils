import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'opcode-lookup',
  name: 'Op code lookup',
  short: 'Find what a 32-bit op code means: jetton, NFT, wallet, DEX and staking messages with TL-B.',
  description: 'Search known TON message op codes by hex, decimal or name and see the standard that defines them and their TL-B. Unknown codes can be checked against toncenter\'s decoder.',
  category: 'reference',
  audience: 'dev',
  network: 'read',
  keywords: ['opcode', 'op code', 'op', 'message op', 'tl-b', 'tlb', '0x0f8a7ea5', 'jetton transfer', 'nft transfer', 'excesses', 'bounce', '0xffffffff', 'internal message', 'query_id', 'crc32'],
  related: ['payload-decoder', 'tlb-opcode-crc32', 'tep-reference', 'tvm-exit-codes'],
  icon: 'i-lucide-hash'
})
