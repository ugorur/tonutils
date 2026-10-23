import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'gasless-send',
  name: `Gasless USD₮ send (no ${COIN_SYMBOL} needed)`,
  short: `Send USD₮ or another supported token with the fee paid in that token, without holding ${COIN_SYMBOL}.`,
  description: `Send USD₮ and a few other tokens from a W5 wallet that has no ${COIN_SYMBOL} (formerly ${COIN_FORMER}) for fees. tonapi's gasless relayer quotes a fee in the token, your wallet signs without broadcasting (TonConnect signMessage), and the relayer pays the network fee.`,
  category: 'wallet-actions',
  audience: 'user',
  network: 'wallet',
  keywords: ['gasless', 'no gas', 'pay fee in usdt', 'usdt without ton', 'battery', 'relayer', 'signMessage', 'w5', 'wallet v5', 'internal_signed', 'tonapi', 'fee in jetton', 'usd₮'],
  related: ['bulk-jetton-sender', 'send-jetton', 'jetton-transfer-builder'],
  icon: 'i-lucide-fuel'
})
