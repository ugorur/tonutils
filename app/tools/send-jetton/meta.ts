import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'send-jetton',
  name: 'Send jettons (USDT and other tokens)',
  short: 'Send USD₮, NOT, DOGS or any jetton with a comment, from your own wallet.',
  description: 'Pick a token from your wallet and send it to an address, .ton domain or .t.me name with an optional comment, approved in your wallet through TonConnect. Builds a standard TEP-74 transfer to your jetton wallet and checks the recipient first: memo-required exchanges, token contracts, spam tokens and fee balance.',
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['send usdt', 'usdt ton', 'jetton transfer', 'send token', 'tep-74', 'notcoin', 'dogs', 'memo', 'comment', 'tonconnect', 'forward amount', 'jetton wallet'],
  related: ['send-ton', 'burn-jettons', 'jetton-info', 'jetton-transfer-builder'],
  icon: 'i-lucide-coins'
})
