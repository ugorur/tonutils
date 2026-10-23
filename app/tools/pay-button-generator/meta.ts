import { COIN_SYMBOL } from '~/utils/currency'
import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'pay-button-generator',
  name: '“Pay with TON” button generator',
  short: `Get a copy-paste HTML button (and optional QR) that lets visitors pay you in ${COIN_SYMBOL} or USD₮.`,
  description: `Generate a styled "Pay with TON" button for any website: plain HTML with inline styles and no script, pointing to a TonUtils checkout page, a Keeper (Tonkeeper) link or a ton:// link. Choose colours and size, add a QR code, preview it on light and dark pages, or copy a Markdown link.`,
  category: 'payments',
  audience: 'both',
  network: 'offline',
  keywords: ['pay button', 'donate button', 'payment button', 'widget', 'embed', 'html snippet', 'website', 'accept ton', 'accept usdt', 'tip', 'donation', 'markdown', 'readme', 'toncoin', 'gram'],
  related: ['payment-link-generator', 'hosted-pay-page', 'invoice-checker'],
  icon: 'i-lucide-mouse-pointer-click'
})
