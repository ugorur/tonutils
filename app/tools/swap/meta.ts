import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'swap',
  name: 'Token swap',
  short: 'Swap GRAM and jettons at the best route across TON DEXes, signed in your wallet.',
  description: 'Swap GRAM (formerly Toncoin) and jettons through the swap.coffee aggregator, which routes across STON.fi, DeDust and other TON DEXes. You see the decoded messages before your wallet signs them through TonConnect. Mainnet only.',
  category: 'defi',
  audience: 'user',
  network: 'wallet',
  privacyNote: 'Quotes come straight from the STON.fi and swap.coffee APIs in your browser. The swap is approved in your own wallet through TonConnect; this site never sees your keys.',
  keywords: ['swap', 'exchange', 'trade', 'buy', 'sell', 'dex', 'stonfi', 'ston.fi', 'dedust', 'swap.coffee', 'aggregator', 'tonconnect', 'usdt', 'convert tokens'],
  related: ['swap-quote', 'dex-pools', 'price-converter'],
  icon: 'i-lucide-repeat'
})
