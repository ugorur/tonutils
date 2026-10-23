import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'vesting-viewer',
  name: 'Vesting wallet viewer',
  short: 'How much is still locked in a vesting wallet, what is unlocked now and when the next unlock is.',
  description: 'Open a TON vesting wallet (or find the ones a wallet owns) to see the total, locked and unlocked amounts right now, the cliff, the next unlock date and the full unlock schedule, plus the whitelisted addresses that may receive locked funds. Uses the contract’s own formula.',
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['vesting', 'lockup', 'locked', 'unlock', 'cliff', 'schedule', 'vesting wallet', 'whitelist', 'get_locked_amount', 'get_vesting_data', 'investors', 'team tokens'],
  related: ['wallet-version-detector', 'multisig-viewer', 'account-overview'],
  icon: 'i-lucide-hourglass'
})
