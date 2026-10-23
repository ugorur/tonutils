import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'transaction-decoder',
  name: 'Transaction BOC decoder',
  short: 'Decode a transaction BOC or hash: every phase, exit codes, gas, fees and decoded messages.',
  description: 'Paste a raw transaction BOC (decoded locally) or a transaction / message hash. See the storage, credit, compute, action and bounce phases, exit and result codes explained, gas used, a full fee breakdown and every message body decoded.',
  category: 'transactions',
  audience: 'dev',
  network: 'read',
  keywords: ['transaction', 'tx', 'boc', 'decode', 'parse', 'phases', 'compute phase', 'action phase', 'bounce phase', 'storage phase', 'exit code', 'result code', 'gas', 'vm steps', 'fees', 'total fees', 'forward fee', 'message body', 'tlb', 'loadTransaction'],
  related: ['tx-retracer', 'message-emulator', 'tx-lookup'],
  icon: 'i-lucide-file-search'
})
