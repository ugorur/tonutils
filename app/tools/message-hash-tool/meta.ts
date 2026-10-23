import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'message-hash-tool',
  name: 'Message hash tool',
  short: 'Message hash, normalized external hash (TEP-467) and body hash of a BOC, then find its transaction',
  description: 'Paste a message BOC, such as the one TonConnect or sendBoc returned, and get its full hash, the TEP-467 normalized hash that toncenter and tonapi index, and the body hash. Then look up the transaction it created on mainnet or testnet.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'read',
  keywords: ['message hash', 'msg hash', 'normalized hash', 'hash_norm', 'tep-467', 'external message', 'sendBoc', 'tonconnect boc', 'find transaction', 'body hash', 'transactionsByMessage', 'ext_in'],
  related: ['boc-converter', 'cell-tree-viewer'],
  icon: 'i-lucide-fingerprint'
})
