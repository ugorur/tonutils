import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'burn-jettons',
  name: 'Burn jettons and clean spam tokens',
  short: 'Permanently burn unwanted or spam jettons from your wallet, several at once.',
  description: 'Select spam or unwanted tokens in your wallet and burn them with a standard TEP-74 burn, approved in your wallet through TonConnect. Spam tokens are flagged, verified tokens get an extra warning, and nothing is sent until you confirm the burn is permanent.',
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['burn', 'burn jetton', 'spam token', 'scam token', 'clean wallet', 'remove token', 'hide token', 'tep-74', 'destroy', 'airdrop scam'],
  related: ['send-jetton', 'jetton-info', 'jetton-transfer-builder'],
  icon: 'i-lucide-flame'
})
