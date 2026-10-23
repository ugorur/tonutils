import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'unfreeze-account',
  name: 'Unfreeze a frozen account',
  short: 'Restore a contract or wallet frozen for unpaid storage fees, with the exact pre-freeze state.',
  description: 'Check a frozen TON account\'s storage debt, recover its code and data from before the freeze from the archive, verify the hash matches, dry-run the fix in a TVM emulator, and send the unfreeze message from your wallet.',
  category: 'wallet-actions',
  audience: 'both',
  network: 'wallet',
  keywords: ['frozen', 'unfreeze', 'storage fee', 'storage debt', 'due payment', 'frozen hash', 'state init', 'restore', 'recover', 'stuck funds', 'rent', 'inactive', 'gram', 'toncoin'],
  related: ['historical-state-viewer', 'account-overview', 'contract-inspector'],
  icon: 'i-lucide-snowflake'
})
