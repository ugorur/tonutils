import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'testnet-faucet-hub',
  name: 'Testnet faucets and hub',
  short: `Get free test ${COIN_SYMBOL}: faucets, your testnet address, balance check, explorers and API endpoints.`,
  description: `Everything for the TON testnet in one place: working faucets for free test ${COIN_SYMBOL} (formerly ${COIN_FORMER}), your address in testnet form (0Q…/kQ…), a testnet balance check, live testnet status, explorers and the testnet API endpoints for toncenter, tonapi and TonClient.`,
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  keywords: ['testnet', 'faucet', 'test ton', 'test gram', 'free ton', 'testgiver', 'testgiver_ton_bot', 'testnet address', '0Q', 'kQ', 'testnet explorer', 'testnet api', 'toncenter testnet', 'tonapi testnet', 'sandbox', 'airdrop'],
  related: ['address-converter', 'network-status', 'tonconnect-tx-tester', 'api-explorer'],
  icon: 'i-lucide-droplets'
})
