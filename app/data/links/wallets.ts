import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'wallets',
  title: 'Wallets',
  description: 'Apps that hold your keys or your coins, plus multisig.',
  icon: 'i-lucide-wallet',
  order: 4,
  links: [
    { title: 'Keeper (formerly Tonkeeper)', url: 'https://keeperwallet.com', description: 'Self-custodial multichain wallet for mobile and browser.', tags: ['wallet', 'mobile', 'extension'] },
    { title: 'My Wallet (formerly MyTonWallet)', url: 'https://mywallet.io', description: 'Open-source self-custodial wallet for browser, desktop and mobile.', tags: ['wallet', 'extension', 'desktop'] },
    { title: 'Tonhub', url: 'https://tonhub.com', description: 'Self-custodial mobile wallet by the Whales team.', tags: ['wallet', 'mobile'] },
    { title: 'Walt (formerly Wallet in Telegram)', url: 'https://walt.io', description: 'Custodial crypto wallet inside Telegram (@walt).', tags: ['wallet', 'telegram'] },
    { title: 'TON Web Wallet', url: 'https://wallet.ton.org', description: 'Official minimal web and desktop wallet.', tags: ['wallet', 'web'] },
    { title: 'TON Wallet source', url: 'https://github.com/ton-blockchain/ton-wallet', description: 'Source code of the official web wallet.', tags: ['wallet', 'github'] },
    { title: 'OKX Wallet', url: 'https://web3.okx.com', description: 'Multichain wallet with TON support.', tags: ['wallet'] },
    { title: 'SafePal', url: 'https://safepal.com', description: 'Hardware and software multichain wallet with TON support.', tags: ['wallet', 'hardware'] },
    { title: 'Multisig app', url: 'https://multisig.ton.org', description: 'Web app for multisig v2 wallets.', tags: ['wallet', 'multisig'] },
    { title: 'Wallet versions compared', url: 'https://docs.ton.org/contracts/standard/wallets/comparison', description: 'How v3, v4, W5 and highload wallet contracts differ.', tags: ['wallet'] }
  ]
})
