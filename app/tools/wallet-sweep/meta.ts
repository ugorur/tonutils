import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'wallet-sweep',
  name: 'Move everything to a new wallet',
  short: `Move every token, NFT, .ton domain and the remaining ${COIN_SYMBOL} from an old wallet to a new one.`,
  description: `Connect your old wallet (for example v4R2) and enter the new one (for example W5). The tool lists every jetton, NFT, .ton domain and Telegram username, skips spam, builds the transfers in as few approvals as your wallet allows, then sends the remaining ${COIN_SYMBOL}. Everything is approved in your wallet through TonConnect.`,
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['migrate wallet', 'move wallet', 'sweep', 'v4 to w5', 'wallet migration', 'transfer all', 'empty wallet', 'move nfts', 'move jettons', 'move domains', 'compromised wallet', 'new wallet', 'drain'],
  related: ['wallet-version-detector', 'portfolio', 'bulk-jetton-sender', 'send-ton'],
  icon: 'i-lucide-truck'
})
