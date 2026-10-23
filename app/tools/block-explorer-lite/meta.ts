import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'block-explorer-lite',
  name: 'Block and shard inspector',
  short: 'Browse masterchain blocks and their shard blocks, and find which shard an address lives in.',
  description: 'See the latest (or any) masterchain block with its shard blocks: seqno, time, transaction counts, shard prefixes and split/merge flags. Find the shard of any address and list the transactions of a block.',
  category: 'network-stats',
  audience: 'dev',
  network: 'read',
  keywords: ['block', 'masterchain', 'shard', 'shardchain', 'workchain', 'seqno', 'block explorer', 'shard prefix', 'shard id', 'split', 'merge', 'gen_utime', 'tx count', 'which shard', 'jetton 2.0', 'sharding'],
  related: ['transaction-decoder', 'account-overview'],
  icon: 'i-lucide-blocks'
})
