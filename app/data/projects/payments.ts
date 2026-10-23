import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'payments',
  title: 'Payments',
  description: 'Accept and send crypto in Telegram bots, Mini Apps and shops.',
  icon: 'i-lucide-credit-card',
  order: 6,
  projects: [
    { name: 'Walt Merchant', url: 'https://pay.wallet.tg', description: 'Formerly Wallet Pay. Merchant API for accepting crypto in bots and Mini Apps.', tags: ['payments', 'api', 'telegram'] },
    { name: 'Send (CryptoBot)', url: 'https://app.send.tg', description: 'Custodial Telegram bot wallet with exchange, checks, invoices and a payment API.', tags: ['payments', 'api', 'telegram', 'custodial'] },
    { name: 'xRocket', url: 'https://xrocket.exchange', description: 'Telegram bot wallet and exchange with tips, cheques, invoices and a Pay API.', tags: ['payments', 'api', 'telegram', 'custodial'] }
  ]
})
