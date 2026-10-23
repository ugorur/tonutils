import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'single-nominator-tool',
  name: 'Single nominator pool owner tool',
  short: 'Inspect a single nominator pool and withdraw or change the validator from the owner wallet.',
  description: 'For validators who use the ton-blockchain/single-nominator contract: read the owner and validator, the free balance, the stake in the current validator set and what the elector can return, then withdraw or change the validator from the owner wallet through TonConnect.',
  category: 'staking',
  audience: 'dev',
  network: 'wallet',
  keywords: ['single nominator', 'validator', 'owner', 'withdraw', 'change validator', 'get_roles', 'elector', 'mytonctrl', 'staking pool', '0x1000', '0x1001'],
  related: ['stake-unstake', 'get-method-runner', 'contract-inspector'],
  icon: 'i-lucide-server-cog'
})
