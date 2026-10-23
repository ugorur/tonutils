import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'contract-deployer',
  name: 'Deploy any contract',
  short: 'Deploy a contract from its code and data BOC (or a StateInit) through your wallet.',
  description: 'Paste or drop the compiled code and initial data (Blueprint, func-js or tolk-js output) or a ready StateInit, see the address it will get, and deploy it from your connected wallet with an optional first message.',
  category: 'contracts',
  audience: 'dev',
  network: 'wallet',
  keywords: ['deploy', 'deploy contract', 'smart contract deploy', 'stateinit', 'state init', 'code boc', 'data boc', 'blueprint', 'tonconnect deploy', 'contract address', 'func', 'tolk', 'tact', 'masterchain'],
  related: ['stateinit-builder', 'tolk-func-playground', 'library-publisher', 'contract-address-from-stateinit'],
  icon: 'i-lucide-rocket'
})
