import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'payment-link-decoder',
  name: 'Payment link & QR decoder',
  short: 'See what a ton:// or Keeper payment link or QR really asks you to pay, before you open it.',
  description: `Paste or scan a ton://, Keeper (Tonkeeper) or Tonhub payment link or QR code to see the recipient, the amount in ${COIN_SYMBOL} or tokens, the comment or decoded binary body, and the expiry. The recipient is checked against tonapi's scam flags.`,
  category: 'payments',
  audience: 'user',
  network: 'read',
  keywords: ['decode payment link', 'qr scanner', 'scan qr', 'ton://transfer', 'deeplink', 'tonkeeper link', 'keeper', 'tonhub', 'check link', 'scam check', 'phishing', 'bin payload', 'invoice'],
  related: ['payment-link-generator', 'payload-decoder', 'hosted-pay-page'],
  icon: 'i-lucide-scan-qr-code'
})
