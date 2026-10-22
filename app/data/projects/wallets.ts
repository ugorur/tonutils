import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'wallets',
  title: 'Wallets',
  description: 'Self-custodial wallets for holding and sending TON.',
  icon: 'i-lucide-wallet',
  order: 1,
  projects: [
    { name: 'Tonkeeper', url: 'https://tonkeeper.com', description: 'Popular self-custodial wallet for mobile, desktop and browser.', featured: true },
    { name: 'MyTonWallet', url: 'https://mytonwallet.io', description: 'Feature-rich wallet with a browser extension and web app.', featured: true },
    { name: 'Tonhub', url: 'https://tonhub.com', description: 'Mobile wallet with staking built in.' }
  ]
})
