import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-info',
  name: 'Jetton (token) info',
  short: 'Full card for any TON token: supply, holders, admin, verification, price, chart and DEX pools.',
  description: 'Look up any jetton (TON token) by its master address: name, symbol, decimals, total supply, holder count, who controls it (admin or renounced), whether it can be frozen, where its metadata lives, plus price, a price chart and its STON.fi / DeDust pools.',
  category: 'jettons',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, plus DexScreener for market data. Nothing you enter is stored.',
  keywords: ['jetton', 'token', 'token info', 'supply', 'holders', 'admin', 'renounced', 'mintable', 'metadata', 'TEP-64', 'price', 'chart', 'pools', 'STON.fi', 'DeDust', 'USDT', 'scam check', 'verified'],
  related: ['jetton-holders', 'jetton-history', 'jetton-wallet-address-calculator', 'jetton-wallet-status'],
  icon: 'i-lucide-coins'
})
