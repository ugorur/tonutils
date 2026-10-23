import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-history',
  name: 'Jetton transfer history',
  short: 'Every transfer, mint and burn of one token for a wallet, with comments and counterparties.',
  description: 'List all movements of one jetton (TON token) for a wallet: incoming and outgoing transfers with their comments and counterparties, mints, burns and failed attempts. Filter, page back in time and export to CSV.',
  category: 'jettons',
  audience: 'user',
  network: 'read',
  keywords: ['jetton', 'token', 'history', 'transfers', 'transactions', 'USDT history', 'burns', 'mints', 'comment', 'memo', 'statement', 'CSV export', 'failed transfer'],
  related: ['jetton-info', 'jetton-wallet-status', 'tx-history', 'history-csv-export'],
  icon: 'i-lucide-history'
})
