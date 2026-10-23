import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tonconnect-link-decoder',
  name: 'TonConnect link checker',
  short: 'Is this "Connect wallet" link or QR safe? See which site asks, what for, and hidden transactions.',
  description: 'Paste a TonConnect link (tc://, a Tonkeeper or Telegram Wallet link) or scan its QR code before you connect. See which app manifest and real domain are asking, what your wallet would share or sign, where it sends you afterwards, and any transaction hidden in the link, with phishing warnings for look-alike domains.',
  category: 'security',
  audience: 'both',
  network: 'read',
  privacyNote: 'The link is decoded in your browser. The app manifest it points to is fetched through a small checker on this site, because most hosts send no CORS headers. Only the URL is passed on and nothing is stored.',
  keywords: ['tonconnect', 'ton connect', 'tc://', 'connect link', 'qr code', 'phishing', 'scam', 'drainer', 'manifest', 'tonconnect-manifest.json', 'wallet connect', 'deeplink', 'universal link', 'telegram wallet', 'startapp', 'ton_proof', 'is this safe'],
  related: ['ton-proof-verifier', 'verify-signature', 'payment-link-decoder', 'address-poisoning-detector'],
  icon: 'i-lucide-scan-qr-code'
})
