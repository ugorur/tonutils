import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'scam-checker',
  name: 'Scam checker',
  short: 'Check any address, token or NFT against scam lists, known labels and spam behaviour.',
  description: 'Paste any TON address: a wallet, token, jetton wallet, NFT or collection. See what it is and every public scam signal on it: the tonapi / Tonkeeper scam lists, known names, phishing links in token names, fake look-alike tickers, spam or poisoning activity and unknown "claim" contracts.',
  category: 'security',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['scam', 'scam check', 'is it a scam', 'blacklist', 'phishing', 'drainer', 'fake token', 'fake nft', 'spam', 'airdrop scam', 'claim', 'verify address', 'reputation', 'tonkeeper spam'],
  related: ['token-safety-check', 'safe-to-send', 'spam-nft-cleaner', 'address-poisoning-detector'],
  icon: 'i-lucide-shield-alert'
})
