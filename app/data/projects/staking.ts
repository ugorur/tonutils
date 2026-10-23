import { COIN_NAME } from '../../utils/currency'
import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'staking',
  title: 'Staking',
  description: `Stake ${COIN_NAME} directly or get a liquid staking token you can use in DeFi.`,
  icon: 'i-lucide-layers',
  order: 3,
  projects: [
    { name: 'Tonstakers', url: 'https://tonstakers.com', description: `Largest liquid staking protocol on TON: stake ${COIN_NAME}, receive tsTON.`, tags: ['liquid-staking', 'audited'], featured: true },
    { name: 'Hipo Finance', url: 'https://hipo.finance', description: 'Open-source liquid staking that issues hTON.', tags: ['liquid-staking', 'open-source', 'audited'] },
    { name: 'KTON', url: 'https://kton.io', description: 'Institution-oriented liquid staking by TONX.', tags: ['liquid-staking'] },
    { name: 'bemo', url: 'https://bemo.fi', description: 'Liquid staking that issues stTON and bmTON.', tags: ['liquid-staking'] },
    { name: 'Nexton', url: 'https://nexton.solutions', description: 'Liquid staking combined with basis-trading yield.', tags: ['liquid-staking', 'yield'] },
    { name: 'TON Whales', url: 'https://tonwhales.com', description: 'Veteran nominator pool operator and the team behind Tonhub.', tags: ['staking'] }
  ]
})
