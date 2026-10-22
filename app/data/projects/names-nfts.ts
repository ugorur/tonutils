import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'names-nfts',
  title: 'Names & NFTs',
  description: 'Domains, usernames and collectibles.',
  icon: 'i-lucide-gem',
  order: 3,
  projects: [
    { name: 'TON DNS', url: 'https://dns.ton.org', description: 'Register and manage .ton domains.', featured: true },
    { name: 'Fragment', url: 'https://fragment.com', description: 'Marketplace for Telegram usernames and numbers.' },
    { name: 'Getgems', url: 'https://getgems.io', description: 'NFT marketplace on TON.', featured: true }
  ]
})
