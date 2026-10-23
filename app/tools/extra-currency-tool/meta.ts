import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'extra-currency-tool',
  name: 'Extra currency inspector & sender',
  short: 'See an account\'s TON extra currency balances and send them through TonConnect (extraCurrency).',
  description: 'Lists the native extra currencies (ExtraCurrencyCollection) an account holds, with ids normalized to uint32, and builds a TonConnect transfer carrying extra currencies plus the raw ExtraCurrencyCollection BOC. Sending needs a wallet that supports extra currencies.',
  category: 'transactions',
  audience: 'dev',
  network: 'wallet',
  keywords: ['extra currency', 'extra currencies', 'ExtraCurrencyCollection', 'extraCurrency', 'ECC', 'ConfigParam 7', 'FMS', 'ECHIDNA', 'native token', 'TonConnect', 'currency id', 'value_extra_currencies'],
  related: ['send-mode-calculator', 'account-overview'],
  icon: 'i-lucide-gem'
})
