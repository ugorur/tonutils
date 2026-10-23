import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'telegram-collectibles',
  name: 'Telegram collectibles in a wallet',
  short: 'All Fragment usernames, +888 numbers and Telegram gift NFTs a wallet holds, plus scam NFT warnings.',
  description: 'See every Telegram collectible a TON wallet holds: Fragment usernames, anonymous +888 numbers and gift NFTs grouped by collection, with listing prices, Fragment links, CSV export and a warning for scam NFTs that imitate Telegram.',
  category: 'telegram',
  audience: 'user',
  network: 'read',
  keywords: ['telegram', 'fragment', 'collectibles', 'usernames', '+888', 'numbers', 'gifts', 'telegram gifts', 'plush pepe', 'nft', 'portfolio', 'scam nft'],
  related: ['telegram-username-lookup', 'portfolio'],
  icon: 'i-lucide-gift'
})
