import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'explorers',
  title: 'Explorers',
  description: 'Look up accounts, transactions, jettons and NFTs on mainnet and testnet.',
  icon: 'i-lucide-telescope',
  order: 3,
  links: [
    { title: 'Tonviewer', url: 'https://tonviewer.com', description: 'Explorer with readable traces of every transaction.', tags: ['explorer'] },
    { title: 'Tonscan', url: 'https://tonscan.org', description: 'Explorer for accounts, blocks, jettons and NFTs.', tags: ['explorer'] },
    { title: 'Tonscan.com', url: 'https://tonscan.com', description: 'Independent explorer for accounts and transactions.', tags: ['explorer'] },
    { title: 'Tonwhales explorer', url: 'https://tonwhales.com/explorer', description: 'Explorer by the Whales team.', tags: ['explorer'] },
    { title: '3xpl TON', url: 'https://3xpl.com/ton', description: 'Multi-chain explorer with TON support.', tags: ['explorer'] },
    { title: 'TON explorer (toncoin.org)', url: 'https://explorer.toncoin.org', description: 'Minimal explorer that reads straight from liteservers.', tags: ['explorer'] },
    { title: 'Tonviewer testnet', url: 'https://testnet.tonviewer.com', description: 'Tonviewer for testnet.', tags: ['explorer', 'testnet'] },
    { title: 'Tonscan testnet', url: 'https://testnet.tonscan.org', description: 'Tonscan for testnet.', tags: ['explorer', 'testnet'] },
    { title: 'TON testnet explorer (toncoin.org)', url: 'https://test-explorer.toncoin.org', description: 'Minimal liteserver-based explorer for testnet.', tags: ['explorer', 'testnet'] }
  ]
})
