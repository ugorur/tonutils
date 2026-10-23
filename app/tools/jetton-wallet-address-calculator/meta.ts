import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-wallet-address-calculator',
  name: 'Jetton wallet address calculator',
  short: 'Find the jetton wallet address of an owner for any token, one or thousands at once.',
  description: 'Every TON wallet holds each token in a separate jetton wallet contract. Enter a token and one or many owner addresses to get their jetton wallet addresses, computed by the token\'s own get_wallet_address code (on-chain for one, in your browser for bulk lists).',
  category: 'jettons',
  audience: 'both',
  network: 'read',
  keywords: ['jetton wallet', 'jetton wallet address', 'get_wallet_address', 'token wallet', 'USDT wallet address', 'bulk', 'owner', 'TEP-74', 'jetton master'],
  related: ['jetton-wallet-status', 'jetton-info', 'get-method-runner'],
  icon: 'i-lucide-calculator'
})
