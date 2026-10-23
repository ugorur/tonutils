import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'history-csv-export',
  name: 'History CSV export (tax report)',
  short: `Export a wallet's ${COIN_SYMBOL} and jetton movements for a date range to CSV, with fiat values.`,
  description: `Export every ${COIN_SYMBOL} (formerly ${COIN_FORMER}) and jetton movement of a TON wallet for a date range to CSV: date, type, amount, token, counterparty, comment, fee and tx hash, optionally valued in USD, EUR and more. Koinly-compatible format included.`,
  category: 'transactions',
  audience: 'user',
  network: 'read',
  keywords: ['csv', 'export', 'tax', 'tax report', 'koinly', 'cointracker', 'accounting', 'excel', 'spreadsheet', 'history', 'fiat', 'usd', 'eur', 'cost basis', 'toncoin', 'gram', 'jetton'],
  related: ['tx-history', 'tx-receipt'],
  icon: 'i-lucide-file-spreadsheet'
})
