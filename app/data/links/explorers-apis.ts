import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'explorers-apis',
  title: 'Explorers & APIs',
  description: 'See what happened on-chain and query it from code.',
  icon: 'i-lucide-telescope',
  order: 3,
  links: [
    { title: 'Tonviewer', url: 'https://tonviewer.com', description: 'Explorer with readable traces of every transaction.' },
    { title: 'Tonscan', url: 'https://tonscan.org', description: 'Explorer for accounts, blocks and jettons.' },
    { title: 'Retracer', url: 'https://retracer.ton.org', description: 'Replay a transaction step by step in the TVM.' },
    { title: 'Contract verifier', url: 'https://verifier.ton.org', description: 'Check that a deployed contract matches its published source.' },
    { title: 'toncenter', url: 'https://toncenter.com', description: 'Public HTTP API (v2 and v3 indexer).' },
    { title: 'TonAPI', url: 'https://tonapi.io', description: 'REST API with parsed jettons, NFTs and events.' },
    { title: 'Testnet faucet', url: 'https://t.me/testgiver_ton_bot', description: 'Telegram bot that sends free testnet TON.' }
  ]
})
