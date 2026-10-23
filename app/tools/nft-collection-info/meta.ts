import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-collection-info',
  name: 'NFT collection explorer',
  short: 'Collection details, item browser, holder count and top holders for any TON NFT collection.',
  description: 'Look up a TON NFT collection: name, owner, item count, verification and royalty, browse its items page by page, and load the holder distribution (unique holders, top holders, items listed for sale) with CSV export.',
  category: 'nfts',
  audience: 'user',
  network: 'read',
  keywords: ['nft collection', 'collection', 'holders', 'top holders', 'holder distribution', 'items', 'getgems collection', 'royalty', 'floor', 'listed', 'csv'],
  related: ['nft-rarity', 'nft-viewer', 'nft-gallery', 'nft-history'],
  icon: 'i-lucide-library'
})
