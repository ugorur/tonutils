import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'balance-diff',
  name: 'Balance change between dates',
  short: `How much ${COIN_SYMBOL} a wallet gained or lost between two dates, with a balance chart.`,
  description: `Pick two dates and see exactly how much a TON wallet's ${COIN_SYMBOL} (formerly ${COIN_FORMER}) balance changed: start and end balance read from the chain, received, sent, fees, a balance chart and a per-day table you can export.`,
  category: 'explorer-lookup',
  audience: 'user',
  network: 'read',
  keywords: ['balance', 'history', 'change', 'profit', 'loss', 'pnl', 'between dates', 'daily balance', 'chart', 'gram', 'toncoin', 'ton', 'taxes', 'csv'],
  related: ['historical-state-viewer', 'activity-wrapped', 'tx-history', 'history-csv-export'],
  icon: 'i-lucide-chart-line'
})
