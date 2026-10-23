import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'bulk-jetton-sender',
  name: 'Bulk jetton & USD₮ sender',
  short: 'Airdrop or pay out USD₮ or any jetton to a CSV list from your wallet, in as few approvals as you can',
  description: 'Paste or upload a CSV of address, amount and comment and send USD₮ or any other jetton to everyone through TonConnect. Each recipient is checked (no sending to token contracts), the total is checked against your balance, and transfers are batched up to 255 per approval on W5 wallets.',
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['airdrop', 'multisender', 'bulk jetton', 'mass payout', 'usdt', 'usd₮', 'tether', 'payroll', 'token distribution', 'csv', 'jetton transfer', 'TEP-74', 'batch'],
  related: ['bulk-sender', 'jetton-transfer-builder', 'jetton-holders', 'bulk-balance-checker'],
  icon: 'i-lucide-hand-coins'
})
