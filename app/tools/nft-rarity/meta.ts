import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-rarity',
  name: 'NFT rarity calculator',
  short: 'Rarity score and rank for every item of a TON NFT collection, from its traits.',
  description: 'Loads every item of a TON NFT collection, scores each one with statistical rarity (sum of 1 / trait frequency, like rarity.tools) and ranks them. Look up any item to see how rare each of its traits is, and export the full ranking to CSV.',
  category: 'nfts',
  audience: 'user',
  network: 'read',
  keywords: ['nft rarity', 'rarity rank', 'rarity score', 'traits', 'attributes', 'rarity.tools', 'trait frequency', 'rare nft', 'telegram gift rarity', 'csv'],
  related: ['nft-collection-info', 'nft-viewer'],
  icon: 'i-lucide-gem'
})
