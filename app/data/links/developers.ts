import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'developers',
  title: 'Build on TON',
  description: 'Languages, SDKs and frameworks for writing and testing contracts.',
  icon: 'i-lucide-code',
  order: 2,
  links: [
    { title: 'Your first smart contract', url: 'https://docs.ton.org/contracts/blueprint/first-smart-contract', description: 'Step-by-step guide with Blueprint.' },
    { title: 'Blueprint', url: 'https://github.com/ton-org/blueprint', description: 'Development environment for writing, testing and deploying contracts.' },
    { title: 'Tact language', url: 'https://docs.tact-lang.org', description: 'A high-level, type-safe language for TON contracts.' },
    { title: '@ton/ton SDK', url: 'https://github.com/ton-org/ton', description: 'The TypeScript SDK this site uses for wallets and addresses.' },
    { title: 'TON Connect', url: 'https://github.com/ton-connect', description: 'Protocol and SDKs for connecting wallets to apps.' },
    { title: 'TON core repository', url: 'https://github.com/ton-blockchain', description: 'Node software, standards and the reference implementation.' }
  ]
})
