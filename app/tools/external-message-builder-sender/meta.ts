import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'external-message-builder-sender',
  name: 'External message builder & broadcaster',
  short: 'Check and broadcast a signed external BOC (sendBoc), sign a testnet transfer or wrap a raw external',
  description: 'Paste a signed external message to see its destination, seqno, expiry, outgoing transfers and normalized hash, then broadcast it and wait for the transaction. On testnet you can also sign a W5/v4/v3 transfer locally from a throwaway key, or build an unsigned external for your own contract.',
  category: 'transactions',
  audience: 'dev',
  network: 'read',
  keywords: ['sendBoc', 'sendBocReturnHash', 'broadcast', 'external message', 'ext_in_msg', 'signed boc', 'seqno', 'valid_until', 'normalized hash', 'TEP-467', 'hash_norm', 'wallet v5', 'W5', 'v4r2', 'testnet', 'createTransfer', 'push transaction'],
  related: ['message-hash-tool', 'message-emulator', 'tx-lookup', 'send-mode-calculator'],
  icon: 'i-lucide-radio-tower'
})
