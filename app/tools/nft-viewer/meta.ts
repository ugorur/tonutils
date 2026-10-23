import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-viewer',
  name: 'NFT item viewer',
  short: 'Image, attributes, owner, sale price, royalty and SBT status of any TON NFT.',
  description: 'Paste an NFT address or Getgems link to see its image, attributes, real owner, current marketplace listing and price, creator royalty, verification status and whether it is a soulbound token (SBT).',
  category: 'nfts',
  audience: 'user',
  network: 'read',
  keywords: ['nft', 'nft item', 'getgems', 'royalty', 'sbt', 'soulbound', 'metadata', 'attributes', 'owner', 'for sale', 'telegram gift', 'collectible', 'TEP-62', 'TEP-66'],
  related: ['nft-history', 'nft-collection-info', 'nft-gallery', 'nft-rarity'],
  icon: 'i-lucide-image'
})
