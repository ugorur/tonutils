import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'token-list',
  name: 'Token list',
  short: 'Browse TON jettons by liquidity, market cap or volume, with verification badges.',
  description: 'A directory of jettons on TON: rank tokens by liquidity, market cap, 24h volume or price change, search by name, symbol or address, see verification status and holder counts, and export the list to CSV.',
  category: 'jettons',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser loads the swap.coffee token list and queries tonapi directly. Nothing you enter is stored.',
  keywords: ['token list', 'jetton list', 'directory', 'top tokens', 'market cap', 'verified tokens', 'coingecko', 'price', 'volume', 'liquidity', 'scam check'],
  related: ['holders-snapshot', 'jetton-deployer'],
  icon: 'i-lucide-list-ordered'
})
