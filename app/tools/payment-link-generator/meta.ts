import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'payment-link-generator',
  name: 'Payment link & QR generator',
  short: `Create a ${COIN_SYMBOL} or USD₮ payment link and QR code anyone can pay from their TON wallet.`,
  description: `Build a payment request for ${COIN_SYMBOL} (formerly ${COIN_FORMER}) or any jetton such as USD₮: address, amount, comment and expiry. Get a ton:// link, Keeper (Tonkeeper) and Tonhub universal links, a QR code to download as PNG or SVG, and a shareable checkout page.`,
  category: 'payments',
  audience: 'user',
  network: 'offline',
  keywords: ['payment link', 'qr code', 'ton://transfer', 'deeplink', 'deep link', 'tonkeeper link', 'keeper', 'tonhub', 'invoice', 'request payment', 'usdt', 'jetton', 'toncoin', 'gram', 'donation', 'tip', 'checkout'],
  related: ['payment-link-decoder', 'hosted-pay-page', 'invoice-checker', 'pay-button-generator'],
  icon: 'i-lucide-qr-code'
})
