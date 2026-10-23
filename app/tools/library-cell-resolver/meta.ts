import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'library-cell-resolver',
  name: 'Library cell resolver',
  short: 'Find library cells in contract code and fetch the real code they point to.',
  description: 'Many contracts (USDT jetton wallets, some W5 wallets) store only a tiny library cell instead of their code. Paste an address, code BOC or library hash to see both hashes and download the real code from the masterchain, verified by hash.',
  category: 'contracts',
  audience: 'dev',
  network: 'read',
  keywords: ['library', 'exotic cell', 'library cell', 'code hash', 'getLibraries', 'jetton 2.0', 'usdt wallet code', 'masterchain library', 'tvm'],
  related: ['contract-inspector', 'contract-source-verifier-lookup', 'get-method-runner'],
  icon: 'i-lucide-library'
})
