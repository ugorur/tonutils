import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'historical-state-viewer',
  name: 'Account state at a past date',
  short: 'See any account\'s balance, code, data and get-method results as of a past date or block.',
  description: 'Pick a date or masterchain block and see a TON account exactly as it was then: balance, status, code and data hashes, storage stats, and get-method results run in a TVM emulator in your browser.',
  category: 'explorer-lookup',
  audience: 'dev',
  network: 'read',
  keywords: ['history', 'historical', 'archive', 'past balance', 'block', 'seqno', 'snapshot', 'state', 'get method', 'time travel', 'shard account', 'code', 'data', 'emulator', 'sandbox'],
  related: ['balance-diff', 'unfreeze-account'],
  icon: 'i-lucide-history'
})
