import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'my-staking',
  name: 'My staking positions',
  short: 'See every stake of a wallet: pools, tsTON and other liquid tokens, pending withdrawals.',
  description: `All staking positions of a TON wallet in one place: nominator pool stakes with pending deposits and withdrawals ready to claim, liquid staking tokens (tsTON, stGRAM, hGRAM) valued in ${COIN_SYMBOL}, pending Tonstakers withdrawal bills, and estimated rewards at the current APY.`,
  category: 'staking',
  audience: 'user',
  network: 'read',
  keywords: ['my stake', 'staking balance', 'staking rewards', 'tston balance', 'withdrawal', 'ready to withdraw', 'pending deposit', 'nominator', 'tonstakers', 'ton whales', 'liquid staking', 'portfolio'],
  related: ['stake-unstake', 'staking-pools', 'portfolio'],
  icon: 'i-lucide-piggy-bank'
})
