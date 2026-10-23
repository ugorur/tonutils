import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'bridges',
  title: 'Bridges & cross-chain',
  description: 'Move assets between TON, other chains and exchanges.',
  icon: 'i-lucide-arrow-left-right',
  order: 9,
  projects: [
    { name: 'TAC', url: 'https://www.tac.build', description: 'TON Application Chain: lets EVM dApps serve TON users with native TON wallets.', tags: ['bridge', 'evm'] },
    { name: 'Symbiosis', url: 'https://symbiosis.finance', description: 'Cross-chain swaps with routes between TON and EVM chains.', tags: ['bridge'] },
    { name: 'Layerswap', url: 'https://layerswap.io', description: 'Transfers between TON, other chains and exchange accounts.', tags: ['bridge'] },
    { name: 'Rubic', url: 'https://rubic.exchange', description: 'Cross-chain swap and bridge aggregator with TON support.', tags: ['bridge', 'aggregator'] }
  ]
})
