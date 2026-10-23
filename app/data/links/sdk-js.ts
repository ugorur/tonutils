import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'sdk-js',
  title: 'JavaScript & TON Connect',
  description: 'TypeScript SDKs and the TON Connect wallet protocol.',
  icon: 'i-lucide-braces',
  order: 10,
  links: [
    { title: '@ton/core', url: 'https://github.com/ton-org/ton-core', description: 'Cells, addresses, BOC and serialization primitives.', tags: ['js', 'ts'] },
    { title: '@ton/core API docs', url: 'https://ton-org.github.io/ton-core/', description: 'Generated API reference for @ton/core.', tags: ['js', 'docs'] },
    { title: '@ton/ton', url: 'https://github.com/ton-org/ton', description: 'RPC client, wallets and contract wrappers.', tags: ['js', 'ts'] },
    { title: '@ton/crypto', url: 'https://github.com/ton-org/ton-crypto', description: 'Key derivation, mnemonics and signing.', tags: ['js', 'crypto'] },
    { title: 'TonWeb', url: 'https://github.com/toncenter/tonweb', description: 'Older JavaScript SDK by TON Center, still widely used.', tags: ['js'] },
    { title: 'TON API JS client', url: 'https://github.com/tonkeeper/tonapi-js', description: 'TypeScript client for TonAPI.', tags: ['js', 'api'] },
    { title: 'assets-sdk', url: 'https://github.com/ton-community/assets-sdk', description: 'Create and manage jettons and NFTs from TypeScript.', tags: ['js', 'jetton', 'nft'] },
    { title: 'Tether WDK TON wallet', url: 'https://github.com/tetherto/wdk-wallet-ton', description: 'TON module of Tether\'s Wallet Development Kit.', tags: ['js', 'usdt'] },
    { title: 'TON Connect docs', url: 'https://docs.ton.org/applications/ton-connect/overview', description: 'Official guide to connecting dApps to wallets.', tags: ['tonconnect', 'docs'] },
    { title: 'TON Connect SDK', url: 'https://github.com/ton-connect/sdk', description: '@tonconnect/sdk, @tonconnect/ui and @tonconnect/ui-react.', tags: ['tonconnect', 'js'] },
    { title: 'TON Connect protocol spec', url: 'https://github.com/ton-blockchain/ton-connect', description: 'Specification of the TON Connect protocol.', tags: ['tonconnect', 'spec'] },
    { title: 'TON Connect React demo', url: 'https://github.com/ton-connect/demo-dapp-with-react-ui', description: 'Example dApp built with @tonconnect/ui-react.', tags: ['tonconnect', 'example'] }
  ]
})
