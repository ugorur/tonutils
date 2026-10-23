import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'storage-rent-estimator',
  name: 'Storage rent & freeze estimator',
  short: 'Yearly storage rent of any address, when it could freeze, and how much to keep.',
  description: 'Enter a TON address to see its storage size, yearly rent at today\'s config prices, what it owes right now, the earliest date it could be frozen or deleted, and how much balance covers N years of rent.',
  category: 'network-stats',
  audience: 'both',
  network: 'read',
  keywords: ['storage fee', 'storage rent', 'rent', 'frozen', 'freeze', 'account frozen', 'deleted account', 'due payment', 'freeze_due_limit', 'delete_due_limit', 'last_paid', 'used cells', 'config 18', 'how long will my contract live', 'keep balance'],
  related: ['fee-calculator', 'unfreeze-account', 'account-overview'],
  icon: 'i-lucide-hard-drive'
})
