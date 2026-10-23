import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'contract-inspector',
  name: 'Contract inspector',
  short: 'See what a contract is: code hash, interfaces, get-methods, compiler, code and data.',
  description: 'Paste any TON address to see its status, balance, code and data hashes and BOCs, detected interfaces (jetton, NFT, wallet version), compiler, the list of get-methods and whether verified source exists. Library-based code is detected and its real hash shown.',
  category: 'contracts',
  audience: 'both',
  network: 'read',
  keywords: ['code hash', 'data hash', 'interfaces', 'get methods', 'compiler', 'func', 'tact', 'tolk', 'boc', 'wallet version', 'smart contract', 'account state'],
  related: ['get-method-runner', 'contract-source-verifier-lookup', 'library-cell-resolver'],
  icon: 'i-lucide-scan-search'
})
