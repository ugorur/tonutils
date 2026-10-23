import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'stake-unstake',
  name: 'Stake and unstake',
  short: `Stake ${COIN_SYMBOL} in Tonstakers, TON Whales or a nominator pool, or withdraw, from your wallet.`,
  description: `Deposit ${COIN_SYMBOL} (formerly ${COIN_FORMER}) into Tonstakers liquid staking, a TON Whales pool or a TON Core nominator pool, or unstake, approved in your own wallet through TonConnect. You see the exact message, fees and when the coins come back before you sign.`,
  category: 'staking',
  audience: 'user',
  network: 'wallet',
  keywords: ['stake', 'unstake', 'deposit', 'withdraw', 'tonstakers', 'tston', 'ton whales', 'nominator pool', 'liquid staking', 'burn tston', 'tonconnect', 'staking'],
  related: ['staking-pools', 'my-staking', 'staking-calculator'],
  icon: 'i-lucide-arrow-down-up'
})
