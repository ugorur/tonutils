import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'invoice-checker',
  name: 'Invoice & payment watcher',
  short: `Create a one-off ${COIN_SYMBOL} or USD₮ invoice and watch live until the payment arrives.`,
  description: `Create an invoice with a unique comment and amount in ${COIN_SYMBOL} (formerly ${COIN_FORMER}) or a token such as USD₮, share its link or QR, and watch the receiving address live until the matching payment lands. The invoice lives in the page URL, so it survives reloads and needs no account or backend.`,
  category: 'payments',
  audience: 'user',
  network: 'read',
  keywords: ['invoice', 'payment watcher', 'payment check', 'did they pay', 'receipt', 'payment confirmation', 'comment', 'memo', 'order id', 'freelancer', 'shop', 'usdt', 'toncoin', 'gram', 'checkout'],
  related: ['payment-link-generator', 'hosted-pay-page', 'payment-link-decoder', 'tx-receipt'],
  icon: 'i-lucide-receipt'
})
