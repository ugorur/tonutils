import { COIN_NAME } from '../../utils/currency'
import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'nfts',
  title: 'NFTs & collectibles',
  description: 'NFT marketplaces, Telegram usernames and gifts, and .ton domains.',
  icon: 'i-lucide-gem',
  order: 4,
  projects: [
    { name: 'Getgems', url: 'https://getgems.io', description: 'Largest NFT marketplace on TON: trading, collection launches and Telegram Gifts.', tags: ['nft', 'marketplace', 'telegram-gifts'], featured: true },
    { name: 'Fragment', url: 'https://fragment.com', description: `Telegram's official marketplace for usernames, +888 numbers, gifts, Stars and Premium, paid in ${COIN_NAME}.`, tags: ['telegram', 'marketplace', 'telegram-gifts', 'official'], featured: true },
    { name: 'TON DNS', url: 'https://dns.ton.org', description: 'Official .ton domain auctions and management. Domains are NFTs.', tags: ['domains', 'nft', 'official'] },
    { name: 'Portals', url: 'https://portal-market.com', description: 'Telegram Mini App marketplace for trading Telegram Gifts.', tags: ['marketplace', 'telegram-gifts', 'mini-app'] }
  ]
})
