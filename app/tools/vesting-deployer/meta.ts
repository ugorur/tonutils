import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'vesting-deployer',
  name: 'Vesting wallet creator',
  short: 'Lock GRAM for a team member or investor with a cliff and monthly unlocks, deployed from your wallet.',
  description: 'Create an official TON vesting wallet (the contract vesting.ton.org deploys) for a recipient: start date, total duration, cliff, unlock period and an optional whitelist for staking. Deploy and fund it in one transaction from your connected wallet.',
  category: 'token-launch',
  audience: 'user',
  network: 'wallet',
  keywords: ['vesting', 'vesting wallet', 'lockup', 'lock up', 'cliff', 'unlock schedule', 'team tokens', 'investor allocation', 'token vesting', 'vesting.ton.org', 'GRAM', 'Toncoin'],
  related: ['vesting-viewer', 'multisig-create', 'send-ton'],
  icon: 'i-lucide-calendar-clock'
})
