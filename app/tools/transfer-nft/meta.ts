import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'transfer-nft',
  name: 'Transfer NFTs, domains and usernames',
  short: 'Send one or many NFTs, .ton domains or Telegram usernames to another wallet.',
  description: 'Pick NFTs from your wallet, including .ton domains, Telegram usernames, numbers and gifts, and send them to another address or name with an optional comment, approved in your wallet through TonConnect. Many items are split into as few approvals as your wallet allows; soulbound tokens (SBTs) are detected and blocked.',
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['send nft', 'transfer nft', 'tep-62', 'ton domain transfer', 'telegram username', 'fragment', 'telegram gift', 'anonymous number', 'bulk transfer', 'sbt', 'soulbound', 'ownership'],
  related: ['send-ton', 'send-jetton', 'burn-jettons'],
  icon: 'i-lucide-image-up'
})
