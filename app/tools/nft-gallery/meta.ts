import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-gallery',
  name: 'Wallet NFT gallery',
  short: 'Every NFT a wallet owns, grouped by collection, with spam hidden and CSV export.',
  description: 'See all NFTs held by a TON wallet or .ton name, including items listed for sale, grouped by collection. Spam is hidden, and Telegram gifts, usernames, anonymous numbers and .ton domains get their own filters. Export the list to CSV.',
  category: 'nfts',
  audience: 'user',
  network: 'read',
  keywords: ['nft', 'gallery', 'wallet nfts', 'my nfts', 'collectibles', 'telegram gifts', 'usernames', 'anonymous numbers', '+888', '.ton domains', 'spam nft', 'csv', 'getgems profile'],
  related: ['nft-viewer', 'nft-history', 'nft-collection-info', 'portfolio'],
  icon: 'i-lucide-layout-grid'
})
