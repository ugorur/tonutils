import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-security-checkup',
  name: 'Wallet security checkup',
  short: 'One-page health check: plugins, W5 extensions, scam tokens and NFTs, poisoning, expiring domains.',
  description: 'Enter a wallet address for a red / amber / green checklist: wallet version, v4 plugins and W5 extensions that can move funds without you, a disabled signature, frozen status, scam tokens and NFTs you hold, address poisoning in your history and .ton domains about to expire, each with a link to the tool that fixes it.',
  category: 'security',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['wallet security', 'security check', 'health check', 'audit wallet', 'revoke', 'plugins', 'subscriptions', 'w5 extensions', 'signature disabled', 'scam tokens', 'spam nfts', 'poisoning', 'expiring domains', 'frozen'],
  related: ['address-poisoning-detector', 'spam-nft-cleaner', 'wallet-version-detector', 'dns-renew'],
  icon: 'i-lucide-stethoscope'
})
