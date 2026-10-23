import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-transfer-builder',
  name: 'Jetton transfer & burn builder',
  short: 'Build TEP-74 jetton transfer/burn and TEP-89 provide_wallet_address bodies; send via TonConnect.',
  description: 'Fill a form to build an exact jetton transfer (with comment or custom forward payload), burn, or provide_wallet_address message. It finds your jetton wallet and decimals, shows the BOC and a ton:// link, and can send it from your wallet through TonConnect.',
  category: 'transactions',
  audience: 'dev',
  network: 'wallet',
  keywords: ['jetton', 'jetton transfer', 'TEP-74', 'TEP-89', '0x0f8a7ea5', '0x595f07bc', 'burn', 'provide_wallet_address', 'forward_ton_amount', 'forward_payload', 'custom_payload', 'USDT', 'USD₮', 'payload', 'BOC', 'token transfer', 'response_destination'],
  related: ['nft-transfer-builder', 'send-mode-calculator', 'message-hash-tool'],
  icon: 'i-lucide-coins'
})
