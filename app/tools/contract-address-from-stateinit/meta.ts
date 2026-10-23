import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'contract-address-from-stateinit',
  name: 'Contract address from StateInit',
  short: 'Compute a contract address before deploy from its StateInit or code + initial data.',
  description: 'Paste a StateInit BOC, or the code and initial data BOCs, and get the deterministic TON contract address, the StateInit BOC to deploy with and its hashes. Works for wallets, jetton wallets and any custom contract.',
  category: 'address',
  audience: 'dev',
  network: 'offline',
  keywords: ['stateinit', 'state_init', 'state init', 'contractAddress', 'deploy', 'code', 'data', 'boc', 'hash', 'deterministic', 'predict address', 'blueprint', 'compiled.json', 'workchain'],
  related: ['address-converter'],
  icon: 'i-lucide-package'
})
