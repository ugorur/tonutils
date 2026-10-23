import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-listing-manager',
  name: 'NFT listing manager',
  short: 'See every NFT you have listed for sale, cancel listings in bulk or change their price.',
  description: 'Lists all NFTs an address has on sale (Getgems and marketplaces that use its contracts), checks each sale contract on chain, and lets the seller cancel listings in bulk or reprice them from the wallet, without the marketplace website.',
  category: 'nfts',
  audience: 'user',
  network: 'wallet',
  keywords: ['nft', 'listing', 'listings', 'sale', 'cancel sale', 'delist', 'unlist', 'reprice', 'change price', 'getgems', 'marketplace', 'fixed price', 'revoke', 'bulk cancel'],
  related: ['spam-nft-cleaner', 'nft-gallery', 'nft-viewer'],
  icon: 'i-lucide-tags'
})
