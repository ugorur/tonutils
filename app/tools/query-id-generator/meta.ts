import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'query-id-generator',
  name: 'query_id generator & decoder',
  short: 'Generate uint64 query_ids (random, timestamp, sequential) and decode the time inside one.',
  description: 'Generate query_id values for jetton, NFT and contract messages (random, Date.now(), unix seconds, highload v2 expiry layout or a counter) and decode an existing query_id to see the timestamp or highload v3 shift/bit inside it.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'offline',
  keywords: ['query_id', 'queryId', 'query id', 'uint64', 'random id', 'jetton transfer', 'excesses', 'highload', 'shift', 'bit_number', 'Date.now', 'nonce'],
  related: ['timestamp-helper', 'highload-wallet-v3-tool', 'jetton-transfer-builder'],
  icon: 'i-lucide-hash'
})
