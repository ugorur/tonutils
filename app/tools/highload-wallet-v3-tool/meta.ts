import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'highload-wallet-v3-tool',
  name: 'Highload wallet v3 helper',
  short: 'Highload v3 address, query id encoder, processed check and unsigned batch builder (254+ transfers).',
  description: 'Developer helper for highload wallet v3: compute the address from public key, subwallet id and timeout, split or build query ids (shift and bit number), check on-chain whether a query id was already processed, and build the unsigned message for a batch of up to 254 transfers per internal batch to sign on your own machine.',
  category: 'wallet-keys',
  audience: 'dev',
  network: 'read',
  keywords: ['highload', 'highload v3', 'query_id', 'query id', 'shift', 'bit_number', 'processed?', 'subwallet', 'timeout', 'batch', 'sendBatch', 'airdrop', 'msg_inner', 'exchange', 'withdrawals', 'HighloadQueryId'],
  related: ['wallet-version-detector', 'wallet-address-from-pubkey', 'get-method-runner'],
  icon: 'i-lucide-zap'
})
