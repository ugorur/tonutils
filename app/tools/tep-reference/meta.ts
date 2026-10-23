import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tep-reference',
  name: 'TEP standards index',
  short: 'Every TON Enhancement Proposal with status, messages and get-methods: jettons, NFTs, DNS…',
  description: 'Searchable index of TON Enhancement Proposals (TEPs): merged standards and work in progress, with their op codes, get-method signatures and links to the full text and matching tools.',
  category: 'reference',
  audience: 'dev',
  network: 'offline',
  keywords: ['tep', 'standard', 'tep-74', 'tep-62', 'tep-64', 'tep-89', 'tep-81', 'jetton standard', 'nft standard', 'get_wallet_data', 'get_nft_data', 'tonconnect', 'mintless', 'specification'],
  related: ['opcode-lookup', 'jetton-info', 'nft-viewer', 'tvm-exit-codes'],
  icon: 'i-lucide-book-marked'
})
