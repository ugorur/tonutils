import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'nfts-domains',
  title: 'NFTs, gifts & domains',
  description: 'Marketplaces for NFTs, Telegram usernames and gifts, .ton domains and jetton minting.',
  icon: 'i-lucide-gem',
  order: 6,
  links: [
    { title: 'Getgems', url: 'https://getgems.io', description: 'NFT marketplace for TON collections.', tags: ['nft', 'marketplace'] },
    { title: 'Fragment', url: 'https://fragment.com', description: 'Marketplace for Telegram usernames, numbers, gifts and Stars.', tags: ['nft', 'telegram'] },
    { title: 'Market App', url: 'https://marketapp.org', description: 'Marketplace for NFTs and Telegram gifts.', tags: ['nft', 'gifts'] },
    { title: 'Tonnel Network', url: 'https://www.tonnel.network', description: 'Telegram gifts marketplace.', tags: ['nft', 'gifts'] },
    { title: 'xRare', url: 'https://xrare.io', description: 'NFT marketplace on TON.', tags: ['nft'] },
    { title: 'TON DNS', url: 'https://dns.ton.org', description: 'Official app to register and manage .ton domains.', tags: ['dns', 'domains'] },
    { title: 'Jetton Minter', url: 'https://minter.ton.org', description: 'Official web app to deploy a jetton.', tags: ['jetton', 'tool'] }
  ]
})
