import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'learn',
  title: 'Learn TON',
  description: 'Official documentation and the best places to start.',
  icon: 'i-lucide-book-open',
  order: 1,
  links: [
    { title: 'TON documentation', url: 'https://docs.ton.org', description: 'The official docs: concepts, smart contracts, APIs and guides.' },
    { title: 'Address formats', url: 'https://docs.ton.org/foundations/addresses/formats', description: 'Why one account has raw, bounceable and non-bounceable spellings.' },
    { title: 'Tokens overview', url: 'https://docs.ton.org/contracts/standard/tokens/overview', description: 'How jettons and NFTs work on TON.' },
    { title: 'Awesome TON', url: 'https://github.com/ton-community/awesome-ton', description: 'Community-maintained list of TON resources.' }
  ]
})
