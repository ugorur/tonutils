import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'developer',
  title: 'Developer tooling',
  description: 'Languages, SDKs, testing and deployment tools for building on TON.',
  icon: 'i-lucide-code',
  order: 10,
  projects: [
    { name: 'Blueprint', url: 'https://github.com/ton-org/blueprint', description: 'Standard dev environment for TON contracts: scaffold, build, test and deploy.', tags: ['framework', 'open-source'], featured: true },
    { name: 'TON Docs', url: 'https://docs.ton.org', description: 'Official developer documentation for contracts, TonConnect, wallets, tokens and payments.', tags: ['docs', 'official'] },
    { name: 'Tolk', url: 'https://docs.ton.org/tolk/overview', description: 'TON\'s primary smart-contract language, the successor to FunC.', tags: ['language', 'official'] },
    { name: 'Tact', url: 'https://tact-lang.org', description: 'High-level, TypeScript-like contract language with an audited compiler.', tags: ['language', 'open-source', 'audited'] },
    { name: 'TON Sandbox', url: 'https://github.com/ton-blockchain/sandbox', description: 'Local blockchain emulator for fast contract tests in JS/TS.', tags: ['testing', 'open-source'] },
    { name: '@ton/ton and @ton/core', url: 'https://github.com/ton-org/ton', description: 'Canonical TypeScript SDK for cells, addresses, wallets and RPC clients.', tags: ['sdk', 'open-source'] },
    { name: 'TON Connect SDK', url: 'https://github.com/ton-connect/sdk', description: 'Protocol and SDKs for connecting dApps to TON wallets.', tags: ['sdk', 'tonconnect', 'open-source'] },
    { name: 'TON Kit', url: 'https://github.com/ton-org/kit', description: 'WalletKit and AppKit packages for building wallets and dApps.', tags: ['sdk', 'open-source'] },
    { name: 'tonutils-go', url: 'https://github.com/xssnick/tonutils-go', description: 'Full Go library: liteclient, wallets, jettons, NFTs, DNS, Storage and payment channels.', tags: ['sdk', 'open-source'] },
    { name: 'pytoniq', url: 'https://github.com/yungwine/pytoniq', description: 'Python SDK with a native liteclient, wallets and TL-B tooling.', tags: ['sdk', 'open-source'] },
    { name: 'Telegram Mini Apps SDK', url: 'https://docs.telegram-mini-apps.com', description: 'Community SDKs and docs for building Telegram Mini Apps.', tags: ['sdk', 'mini-app', 'open-source'] },
    { name: 'TON Verifier', url: 'https://verifier.ton.org', description: 'Checks that deployed contract code matches published FunC, Tolk or Tact sources.', tags: ['security', 'official', 'open-source'] },
    { name: 'TON Minter', url: 'https://minter.ton.org', description: 'Official no-code jetton deployer and admin tool.', tags: ['jetton', 'official', 'open-source'] },
    { name: 'Anton', url: 'https://anton.tools', description: 'Open-source, self-hosted indexer that parses contract interfaces.', tags: ['api', 'open-source'] },
    { name: 'TON Studio', url: 'https://tonstudio.io', description: 'Engineering team behind Tact, Tolk tooling and IDE plugins.', tags: ['language', 'open-source'] }
  ]
})
