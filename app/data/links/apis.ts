import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'apis',
  title: 'APIs & RPC nodes',
  description: 'HTTP APIs, indexers and managed node providers for reading and writing chain data.',
  icon: 'i-lucide-server',
  order: 8,
  links: [
    { title: 'TON Center', url: 'https://toncenter.com', description: 'Public HTTP API (v2 and v3 indexer).', tags: ['api', 'rpc'] },
    { title: 'TON Center API v2 reference', url: 'https://toncenter.com/api/v2/', description: 'Interactive docs for the v2 HTTP API.', tags: ['api'] },
    { title: 'TON Center API v3 reference', url: 'https://toncenter.com/api/v3/index.html', description: 'Interactive docs for the v3 indexer API.', tags: ['api', 'indexer'] },
    { title: 'TON Center testnet', url: 'https://testnet.toncenter.com', description: 'TON Center API for testnet.', tags: ['api', 'testnet'] },
    { title: 'TON API docs (official)', url: 'https://docs.ton.org/api/overview', description: 'Official docs for the v2, v3, streaming and emulation APIs.', tags: ['api', 'docs'] },
    { title: 'TON Center HTTP API source', url: 'https://github.com/toncenter/ton-http-api', description: 'Self-hostable source of the v2 HTTP API.', tags: ['api', 'self-host'] },
    { title: 'TON Index worker', url: 'https://github.com/toncenter/ton-index-worker', description: 'Indexer behind the TON Center v3 API.', tags: ['indexer'] },
    { title: 'TonAPI', url: 'https://tonapi.io', description: 'REST and streaming API with decoded events, jettons and NFTs.', tags: ['api'] },
    { title: 'TonAPI docs', url: 'https://docs.tonapi.io', description: 'Documentation for TonAPI.', tags: ['api', 'docs'] },
    { title: 'TON Console', url: 'https://tonconsole.com', description: 'Developer console for TonAPI keys, webhooks and services.', tags: ['api', 'keys'] },
    { title: 'dTON', url: 'https://dton.io', description: 'GraphQL indexer and explorer.', tags: ['api', 'graphql'] },
    { title: 'TON Access (Orbs)', url: 'https://www.orbs.com/ton-access', description: 'Decentralized keyless RPC access by Orbs.', tags: ['rpc'] },
    { title: 'TON Access GitHub', url: 'https://github.com/orbs-network/ton-access', description: 'Client library for Orbs TON Access.', tags: ['rpc', 'js'] },
    { title: 'TONX API', url: 'https://tonxapi.com', description: 'API provider with RPC and indexer services.', tags: ['rpc'] },
    { title: 'TONX API docs', url: 'https://docs.tonxapi.com', description: 'Documentation for TONX API.', tags: ['rpc', 'docs'] },
    { title: 'GetBlock TON', url: 'https://getblock.io/nodes/ton', description: 'Managed TON RPC nodes.', tags: ['rpc'] },
    { title: 'Chainstack TON', url: 'https://chainstack.com/build-better-with-ton', description: 'Managed TON RPC, ADNL and API nodes.', tags: ['rpc'] },
    { title: 'QuickNode TON', url: 'https://www.quicknode.com/chains/ton', description: 'Managed TON RPC endpoints.', tags: ['rpc'] },
    { title: 'Ankr TON RPC', url: 'https://www.ankr.com/rpc/ton/', description: 'Managed TON RPC endpoints.', tags: ['rpc'] },
    { title: 'NOWNodes TON', url: 'https://nownodes.io/nodes/gram-ton', description: 'TON node and explorer API access.', tags: ['rpc'] }
  ]
})
