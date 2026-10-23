import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tvm-exit-codes',
  name: 'TVM exit code lookup',
  short: 'What does exit code 9, 37 or -14 mean? TVM, action phase, wallet, jetton and Tact codes.',
  description: 'Look up any TON exit code: TVM compute-phase errors, action-phase result codes, Tolk and Tact compiler codes, and the error codes of standard wallets, jettons and NFTs, with what usually caused them.',
  category: 'reference',
  audience: 'both',
  network: 'offline',
  keywords: ['exit code', 'error code', 'result code', 'action phase', 'compute phase', 'out of gas', '-14', 'cell underflow', 'tvm error', 'throw', '0xffff', '65535', 'failed transaction', 'tact', 'tolk', 'bounce'],
  related: ['tx-lookup', 'transaction-decoder', 'opcode-lookup', 'tvm-instruction-reference'],
  icon: 'i-lucide-octagon-alert',
  featured: true
})
