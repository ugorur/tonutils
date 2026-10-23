import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'infrastructure',
  title: 'Infrastructure',
  description: 'APIs, RPC nodes, oracles and the TON node itself.',
  icon: 'i-lucide-server',
  order: 8,
  projects: [
    { name: 'Toncenter', url: 'https://toncenter.com', description: 'Core public HTTP API (v2 JSON-RPC and v3 indexer); works keyless at a low rate limit.', tags: ['api', 'rpc', 'open-source'] },
    { name: 'TonAPI', url: 'https://tonapi.io', description: 'Indexed REST and streaming API for accounts, jettons, NFTs and traces, with SDKs.', tags: ['api', 'sdk'] },
    { name: 'TON Console', url: 'https://tonconsole.com', description: 'Developer console for TonAPI keys, webhooks, analytics and gasless services.', tags: ['api'] },
    { name: 'Orbs TON Access', url: 'https://www.orbs.com/ton-access/', description: 'Decentralized keyless RPC gateway with an npm package for dApps.', tags: ['rpc'] },
    { name: 'Chainstack', url: 'https://chainstack.com/build-better-with-ton/', description: 'Managed TON RPC nodes, toncenter-compatible, with a free tier.', tags: ['rpc'] },
    { name: 'GetBlock', url: 'https://getblock.io', description: 'Shared and dedicated TON RPC endpoints.', tags: ['rpc'] },
    { name: 'Ankr', url: 'https://www.ankr.com/rpc/ton/', description: 'Public and premium TON RPC endpoints.', tags: ['rpc'] },
    { name: 'QuickNode', url: 'https://www.quicknode.com/chains/ton', description: 'Managed TON RPC endpoints with add-ons.', tags: ['rpc'] },
    { name: 'Pyth Network', url: 'https://www.pyth.network', description: 'Pull-based price oracle used by Storm Trade, EVAA and others on TON.', tags: ['oracle'] },
    { name: 'RedStone', url: 'https://www.redstone.finance', description: 'Modular oracle with TON price feeds.', tags: ['oracle'] },
    { name: 'TON node', url: 'https://github.com/ton-blockchain/ton', description: 'Reference node, validator, liteserver and CLI tools (fift, func, tonlib).', tags: ['node', 'open-source', 'official'] }
  ]
})
