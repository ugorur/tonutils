import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'staking-calculator',
  name: 'Staking rewards calculator',
  short: `Project ${COIN_SYMBOL} staking rewards per round, month and year, with compounding and fees.`,
  description: `Enter an amount and pick a pool to see what staking ${COIN_SYMBOL} on the TON network earns per payout, per month and per year, with or without compounding, after pool fees, and in US dollars. Uses each pool's live APY and payout cycle.`,
  category: 'staking',
  audience: 'user',
  network: 'read',
  keywords: ['staking calculator', 'apy', 'apr', 'rewards', 'compound', 'yield', 'interest', 'tonstakers', 'ton whales', 'nominator', 'earnings', 'profit'],
  related: ['staking-pools', 'stake-unstake', 'ton-units'],
  icon: 'i-lucide-calculator'
})
