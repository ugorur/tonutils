import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'network-status',
  name: 'Network status',
  short: 'Live TON block height, block time, API health and current fees at a glance.',
  description: 'Is the TON network healthy right now? See the latest masterchain block, block time, shard count, whether toncenter and tonapi are in sync, and the gas, forward and storage fees in force.',
  category: 'network-stats',
  audience: 'both',
  network: 'read',
  keywords: ['status', 'network status', 'is ton down', 'uptime', 'block height', 'seqno', 'masterchain', 'block time', 'toncenter status', 'tonapi status', 'indexer lag', 'gas price', 'fees', 'shards', 'health'],
  related: ['validators-elections', 'config-params-viewer', 'block-explorer-lite', 'supply-stats'],
  icon: 'i-lucide-activity'
})
