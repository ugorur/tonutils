import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'infrastructure',
  title: 'Nodes & network services',
  description: 'Validators, node tooling, staking, TON DNS, Storage and Proxy.',
  icon: 'i-lucide-network',
  order: 14,
  links: [
    { title: 'TON monorepo', url: 'https://github.com/ton-blockchain/ton', description: 'Node, tonlib, the Tolk/FunC/Fift compilers and tools.', tags: ['github', 'node'] },
    { title: 'TON Validators', url: 'https://validators.ton.org', description: 'Official validator dashboard.', tags: ['validators', 'nodes'] },
    { title: 'MyTonCtrl', url: 'https://github.com/ton-blockchain/mytonctrl', description: 'Run and manage validator and liteserver nodes.', tags: ['nodes'] },
    { title: 'Staking docs', url: 'https://docs.ton.org/nodes/staking/overview', description: 'Official docs on staking and nominator pools.', tags: ['staking', 'docs'] },
    { title: 'Nominator pool', url: 'https://github.com/ton-blockchain/nominator-pool', description: 'Nominator pool contract source.', tags: ['staking', 'example'] },
    { title: 'TON Status (Telegram)', url: 'https://t.me/tonstatus', description: 'Network status and upgrade announcements.', tags: ['status', 'telegram'] },
    { title: 'TON DNS docs', url: 'https://docs.ton.org/foundations/web3/ton-dns', description: 'How TON DNS resolves names and records.', tags: ['dns', 'docs'] },
    { title: 'TON Storage docs', url: 'https://docs.ton.org/foundations/web3/ton-storage', description: 'Decentralized file storage on TON.', tags: ['storage'] },
    { title: 'TON Proxy docs', url: 'https://docs.ton.org/foundations/web3/ton-proxy', description: 'Proxy for opening TON Sites.', tags: ['proxy'] },
    { title: 'Tonutils Proxy', url: 'https://github.com/xssnick/Tonutils-Proxy', description: 'Desktop proxy for browsing .ton sites.', tags: ['proxy'] },
    { title: 'Tonutils Storage', url: 'https://github.com/xssnick/tonutils-storage', description: 'Go implementation of TON Storage.', tags: ['storage'] },
    { title: 'Cocoon', url: 'https://cocoon.org/', description: 'Confidential compute network for AI built on TON.', tags: ['ai'] }
  ]
})
