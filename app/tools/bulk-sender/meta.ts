import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'bulk-sender',
  name: `Bulk ${COIN_SYMBOL} sender`,
  short: `Send ${COIN_SYMBOL} (formerly ${COIN_FORMER}) to a CSV list of addresses in as few wallet approvals as possible.`,
  description: `Paste or upload a CSV of address, amount and comment and send ${COIN_SYMBOL} (formerly ${COIN_FORMER}) to everyone from your own wallet through TonConnect. Every recipient is checked first (new wallets get non-bounceable transfers, memo-required exchanges, scam flags), and the list is split into as few signatures as your wallet allows: up to 255 per approval on W5.`,
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['multisender', 'multi send', 'bulk send', 'mass payout', 'batch transfer', 'airdrop', 'payroll', 'csv', 'send to many', 'toncoin', 'gram', 'tonconnect', 'w5', 'maxMessages'],
  related: ['bulk-jetton-sender', 'send-ton', 'bulk-balance-checker', 'address-batch-converter'],
  icon: 'i-lucide-users'
})
