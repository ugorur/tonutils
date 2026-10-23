import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'validators-elections',
  name: 'Validators and elections',
  short: 'Current TON validator set, the open election, its participants and the stake needed to get in.',
  description: `Monitor TON validator elections: the current validator set and stakes, when the next election opens and closes, every participant of the open election, and a simulation of the elector that shows the minimum ${COIN_SYMBOL} stake that would be elected right now.`,
  category: 'network-stats',
  audience: 'both',
  network: 'read',
  keywords: ['validators', 'elections', 'elector', 'validator set', 'stake', 'min stake', 'max factor', 'participants', 'validation round', 'adnl', 'nominator', 'proof of stake', 'config 34', 'config 15', 'config 17'],
  related: ['staking-pools', 'network-status', 'config-params-viewer', 'single-nominator-tool'],
  icon: 'i-lucide-server-cog'
})
