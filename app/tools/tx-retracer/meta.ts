import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tx-retracer',
  name: 'Transaction re-tracer (step-by-step TVM)',
  short: 'Re-run a past transaction in a local TVM and step through every instruction, stack and gas.',
  description: 'Re-executes a mainnet or testnet transaction in your browser on the exact account state, config and libraries of its block, checks the result is bit-identical to the chain, and shows every TVM instruction with the stack and gas at that step.',
  category: 'transactions',
  audience: 'dev',
  network: 'read',
  keywords: ['retrace', 'retracer', 'replay', 're-execute', 'debug', 'debugger', 'tvm', 'vm log', 'step', 'instruction', 'stack', 'trace', 'gas', 'exit code', 'sandbox', 'emulator', 'why did it fail', 'txtracer'],
  related: ['transaction-decoder', 'message-emulator', 'code-disassembler'],
  icon: 'i-lucide-footprints'
})
