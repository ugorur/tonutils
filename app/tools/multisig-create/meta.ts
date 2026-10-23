import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'multisig-create',
  name: 'Create a multisig wallet',
  short: 'Deploy an official multisig v2 wallet: pick the signers, proposers and how many must approve.',
  description: 'Create a TON multisig v2 wallet (the contract multisig.ton.org uses) from your connected wallet. List the signers and optional proposers, choose how many approvals an order needs, and the wallet deploys it with a starting balance.',
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['multisig', 'create multisig', 'deploy multisig', 'multisig v2', 'multi-signature', 'signers', 'threshold', 'treasury', 'dao', 'shared wallet', 'multisig.ton.org', 'GRAM', 'Toncoin'],
  related: ['multisig-viewer', 'send-ton', 'vesting-deployer'],
  icon: 'i-lucide-shield-plus'
})
