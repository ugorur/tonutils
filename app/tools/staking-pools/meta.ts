import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'staking-pools',
  name: 'Staking pools explorer',
  short: `Compare every way to stake ${COIN_SYMBOL}: liquid staking, TON Whales and nominator pools.`,
  description: `Compare all staking options on the TON network side by side: Tonstakers liquid staking, TON Whales pools and TON Core nominator pools, with live APY, minimum stake, TVL, free slots and the next payout. Check which pools a wallet can join and stake ${COIN_SYMBOL} (formerly ${COIN_FORMER}) in one click.`,
  category: 'staking',
  audience: 'user',
  network: 'read',
  keywords: ['staking', 'stake ton', 'stake gram', 'apy', 'nominator pool', 'tonstakers', 'tston', 'ton whales', 'liquid staking', 'validator', 'yield', 'stgram', 'hgram', 'bemo', 'hipo', 'toncoin staking'],
  related: ['staking-calculator', 'stake-unstake', 'my-staking'],
  icon: 'i-lucide-layers'
})
