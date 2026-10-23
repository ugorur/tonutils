import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'community',
  title: 'Community & discovery',
  description: 'Governance, official hubs and app directories.',
  icon: 'i-lucide-users',
  order: 12,
  projects: [
    { name: 'ton.org', url: 'https://ton.org', description: 'Official hub for The Open Network: ecosystem, grants and news.', tags: ['official'] },
    { name: 'TON Vote', url: 'https://ton.vote', description: 'On-chain verified DAO and community voting.', tags: ['governance', 'open-source'] },
    { name: 'Telegram Apps Center', url: 'https://tapps.center', description: 'Curated directory of Telegram Mini Apps and bots.', tags: ['directory', 'mini-app'] },
    { name: 'TON App', url: 'https://ton.app', description: 'Catalog of dApps, wallets and tools on TON.', tags: ['directory'] }
  ]
})
