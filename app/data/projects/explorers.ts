import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'explorers',
  title: 'Explorers & analytics',
  description: 'Look up accounts and transactions, and track tokens and network stats.',
  icon: 'i-lucide-telescope',
  order: 7,
  projects: [
    { name: 'Tonviewer', url: 'https://tonviewer.com', description: 'Most used TON explorer; turns traces, jettons and NFTs into readable events.', tags: ['explorer'], featured: true },
    { name: 'Tonscan', url: 'https://tonscan.org', description: 'Long-standing explorer for accounts, transactions, contracts and validators.', tags: ['explorer'] },
    { name: 'dTON', url: 'https://dton.io', description: 'Indexer with a GraphQL API for raw and parsed blockchain data.', tags: ['explorer', 'api'] },
    { name: 'DYOR.io', url: 'https://dyor.io', description: 'Jetton analytics: prices, holders, liquidity and risk checks.', tags: ['analytics', 'jetton'] },
    { name: 'TON Stat', url: 'https://tonstat.com', description: 'Network dashboard for accounts, transactions, validators and supply.', tags: ['analytics'] }
  ]
})
