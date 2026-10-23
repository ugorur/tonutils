import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tx-receipt',
  name: 'Payment receipt',
  short: 'Turn a tx hash into a clean proof-of-payment receipt to print, save as PDF or PNG.',
  description: 'Make a proof-of-payment receipt from a TON transaction hash: sender, recipient, amount, token, comment, time, fee, value in fiat at the time, explorer link and QR code. Print it, save it as PDF or PNG, or copy it as text.',
  category: 'transactions',
  audience: 'user',
  network: 'read',
  keywords: ['receipt', 'proof of payment', 'invoice', 'payment proof', 'pdf', 'png', 'print', 'merchant', 'support ticket', 'transaction', 'hash', 'usdt', 'gram'],
  related: ['tx-lookup', 'tx-history'],
  icon: 'i-lucide-receipt-text'
})
