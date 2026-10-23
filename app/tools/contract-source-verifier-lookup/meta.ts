import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'contract-source-verifier-lookup',
  name: 'Verified source lookup',
  short: 'Check if a contract has verified source on verifier.ton.org and read its files.',
  description: 'Enter a contract address or code hash to see whether its source code is verified on verifier.ton.org, with the compiler, version and every source file. Library-based contracts are looked up by their real code hash.',
  category: 'contracts',
  audience: 'dev',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly. Source files come from verifier.ton.org through a small relay on this site (it sends no CORS headers). Only the code hash is passed on and nothing is stored.',
  keywords: ['verifier', 'verify', 'verified contract', 'source code', 'func', 'tact', 'tolk', 'compiler version', 'code hash', 'audit'],
  related: ['contract-inspector', 'library-cell-resolver', 'get-method-runner'],
  icon: 'i-lucide-badge-check'
})
