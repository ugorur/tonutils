import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'hosted-pay-page',
  name: 'Shareable checkout page',
  short: `A payment page you can share: payers pay ${COIN_SYMBOL} or USD₮ with TonConnect or a QR code.`,
  description: `Turn a payment request into a shareable checkout link for tips, donations or freelance invoices. Payers see who receives the money (name, scam flag, full address), pay ${COIN_SYMBOL} (formerly ${COIN_FORMER}) or a token with TonConnect, a QR code or a wallet link, and the page confirms when the payment arrives. No backend, no account.`,
  category: 'payments',
  audience: 'user',
  network: 'wallet',
  keywords: ['checkout', 'payment page', 'pay link', 'tip jar', 'donation', 'donate', 'accept payments', 'stripe payment links', 'tonconnect', 'qr code', 'usdt', 'toncoin', 'gram', 'invoice', 'freelancer'],
  related: ['payment-link-generator', 'invoice-checker', 'pay-button-generator', 'payment-link-decoder'],
  icon: 'i-lucide-shopping-cart'
})
