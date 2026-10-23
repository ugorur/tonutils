import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'message-emulator',
  name: 'Message emulator (dry run)',
  short: 'Dry-run a transfer or a signed external message on live state: full trace, fees, exit codes.',
  description: 'Simulate a transfer from any W5, v4 or v3 wallet, or paste a signed external message BOC, and run it on the current chain state without broadcasting. See every resulting transaction, balance changes, exit codes, fees and what each message does.',
  category: 'transactions',
  audience: 'dev',
  network: 'read',
  keywords: ['emulate', 'emulator', 'simulate', 'simulation', 'dry run', 'dry-run', 'preview', 'trace', 'external message', 'boc', 'ignore signature', 'ignore_chksig', 'emulateTrace', 'fees', 'estimate fee', 'exit code', 'before sending', 'w5', 'v4'],
  related: ['transaction-decoder', 'tx-retracer', 'tx-lookup'],
  icon: 'i-lucide-flask-conical'
})
