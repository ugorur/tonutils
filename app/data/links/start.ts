import { defineLinkCategory } from '../types'
import { COIN_FORMER, COIN_NAME } from '../../utils/currency'

export default defineLinkCategory({
  id: 'start',
  title: 'Start here',
  description: 'Official sites, the docs and the best first steps into TON.',
  icon: 'i-lucide-compass',
  order: 1,
  links: [
    { title: 'ton.org', url: 'https://ton.org', description: `Official home of the TON network and its coin, ${COIN_NAME} (formerly ${COIN_FORMER}).`, tags: [] },
    { title: 'TON documentation', url: 'https://docs.ton.org', description: 'Official docs: foundations, contracts, APIs, TON Connect and nodes.', tags: ['docs'] },
    { title: 'Docs: start here', url: 'https://docs.ton.org/start-here', description: 'Core TON concepts explained for newcomers.', tags: ['docs', 'beginner'] },
    { title: 'TON Foundation', url: 'https://ton.foundation/en', description: 'Non-profit that supports the TON ecosystem.', tags: ['foundation'] },
    { title: 'Address formats', url: 'https://docs.ton.org/foundations/addresses/formats', description: 'Why one account has raw, bounceable and non-bounceable spellings.', tags: ['docs', 'address'] },
    { title: 'Tokens overview', url: 'https://docs.ton.org/contracts/standard/tokens/overview', description: 'How jettons and NFTs work on TON.', tags: ['docs', 'jetton', 'nft'] },
    { title: 'Your first smart contract', url: 'https://docs.ton.org/contracts/blueprint/first-smart-contract', description: 'Step-by-step guide to a first contract with Blueprint.', tags: ['tutorial', 'blueprint'] },
    { title: 'TON Hello World', url: 'https://helloworld.tonstudio.io', description: 'Tutorial series from a first wallet to a first contract.', tags: ['tutorial'] },
    { title: 'TON onboarding challenge', url: 'https://github.com/ton-community/ton-onboarding-challenge', description: 'Hands-on challenge for new TON developers.', tags: ['tutorial'] },
    { title: 'Awesome TON', url: 'https://github.com/ton-community/awesome-ton', description: 'Community-maintained list of TON resources.', tags: ['list'] },
    { title: 'TON media kit', url: 'https://ton.org/media', description: 'Logos and brand assets for TON.', tags: ['brand'] }
  ]
})
