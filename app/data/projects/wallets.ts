import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'wallets',
  title: 'Wallets',
  description: 'Hold, send and connect to apps on the TON network.',
  icon: 'i-lucide-wallet',
  order: 1,
  projects: [
    { name: 'Keeper', url: 'https://keeperwallet.com', description: 'Formerly Tonkeeper. The largest self-custodial TON wallet, now multichain, with gasless Battery fees.', tags: ['self-custody', 'multichain', 'tonconnect', 'open-source'], featured: true },
    { name: 'Walt', url: 'https://walt.io', description: 'Formerly Wallet in Telegram. Telegram\'s built-in wallet with a custodial account and a self-custodial TON wallet.', tags: ['telegram', 'custodial', 'self-custody', 'tonconnect'], featured: true },
    { name: 'My Wallet', url: 'https://mywallet.io', description: 'Formerly MyTonWallet. Self-custodial wallet for browser, desktop and mobile, now multichain.', tags: ['self-custody', 'multichain', 'tonconnect', 'open-source'] },
    { name: 'Tonhub', url: 'https://www.tonhub.com', description: 'Self-custodial mobile wallet by TON Whales with a linked payment card.', tags: ['self-custody', 'payments'] },
    { name: 'Bitget Wallet', url: 'https://web3.bitget.com', description: 'Large multichain self-custodial wallet with TON and TonConnect support.', tags: ['self-custody', 'multichain', 'tonconnect'] },
    { name: 'HOT Wallet', url: 'https://hot-labs.org', description: 'Cross-chain wallet from HOT Labs that runs in Telegram, alongside the HOT Protocol stack.', tags: ['multichain', 'mini-app'] }
  ]
})
