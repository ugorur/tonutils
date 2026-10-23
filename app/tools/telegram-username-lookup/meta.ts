import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'telegram-username-lookup',
  name: 'Telegram username and number lookup',
  short: 'Is an @username or +888 number a Fragment NFT? See owner, sale price, auction and transfers.',
  description: 'Enter a Telegram @username or anonymous +888 number to see whether it exists as a Fragment collectible on TON, who owns it, whether it is for sale or on auction, and its recent transfers.',
  category: 'telegram',
  audience: 'user',
  network: 'read',
  keywords: ['telegram', 'username', 'fragment', '@username', 't.me', '+888', 'anonymous number', 'collectible', 'nft', 'auction', 'owner', 'telemint'],
  related: ['telegram-collectibles'],
  icon: 'i-lucide-at-sign'
})
