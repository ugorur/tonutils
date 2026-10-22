import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'defi',
  title: 'DeFi',
  description: 'Swap, lend and stake on TON.',
  icon: 'i-lucide-chart-candlestick',
  order: 2,
  projects: [
    { name: 'STON.fi', url: 'https://ston.fi', description: 'AMM decentralized exchange for TON and jettons.', featured: true },
    { name: 'DeDust', url: 'https://dedust.io', description: 'Decentralized exchange with multiple pool types.', featured: true },
    { name: 'Tonstakers', url: 'https://tonstakers.com', description: 'Liquid staking: stake TON and receive tsTON.' },
    { name: 'EVAA', url: 'https://evaa.finance', description: 'Lending protocol for TON assets.' }
  ]
})
