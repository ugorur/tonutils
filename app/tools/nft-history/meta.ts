import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-history',
  name: 'NFT ownership history',
  short: 'Mints, transfers, listings and sales with prices for one NFT or a whole wallet.',
  description: 'Trace the provenance of a TON NFT (mint, every transfer, listings, auctions and sales with prices) or list all NFT activity of a wallet. Export the timeline to CSV.',
  category: 'nfts',
  audience: 'user',
  network: 'read',
  keywords: ['nft history', 'provenance', 'ownership', 'nft transfers', 'nft sales', 'sale price', 'mint', 'auction', 'bid', 'getgems', 'fragment', 'activity', 'csv'],
  related: ['nft-viewer', 'nft-gallery', 'tx-history'],
  icon: 'i-lucide-history'
})
