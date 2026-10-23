import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'get-method-runner',
  name: 'Get-method runner',
  short: 'Call any get-method on any contract with typed arguments and read decoded results.',
  description: 'Run a smart contract get-method (seqno, get_jetton_data, get_wallet_address, …) with number, address, cell or slice arguments. Results are decoded: numbers in decimal and hex, addresses, content URIs, library cells, tuples, with the exit code explained.',
  category: 'contracts',
  audience: 'dev',
  network: 'read',
  keywords: ['runGetMethod', 'get method', 'getter', 'call contract', 'seqno', 'get_jetton_data', 'get_wallet_address', 'get_nft_data', 'stack', 'tvm', 'exit code'],
  related: ['contract-inspector', 'contract-source-verifier-lookup', 'library-cell-resolver'],
  icon: 'i-lucide-play',
  featured: true
})
