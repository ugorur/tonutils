import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'send-ton',
  name: `Send ${COIN_SYMBOL} with a comment`,
  short: `Send ${COIN_SYMBOL} (formerly ${COIN_FORMER}) to an address or .ton name, with a comment, from your wallet.`,
  description: `Send ${COIN_SYMBOL} (formerly ${COIN_FORMER}) to any address, .ton domain or .t.me name with an optional comment, approved in your wallet through TonConnect. The recipient is checked first: memo required by exchanges, new wallets (sent non-bounceable so coins do not bounce back), scam flags and testnet addresses.`,
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['send ton', 'send gram', 'transfer', 'toncoin', 'comment', 'memo', 'tag', 'exchange deposit', 'tonconnect', 'bounceable', 'non-bounceable', '.ton domain', 'payment'],
  related: ['send-jetton', 'transfer-nft', 'address-converter', 'ton-units'],
  icon: 'i-lucide-send',
  featured: true
})
