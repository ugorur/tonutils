import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'security',
  title: 'Security & audits',
  description: 'Contract verification, security guidance and firms that audited TON.',
  icon: 'i-lucide-shield-check',
  order: 15,
  links: [
    { title: 'Contract Verifier', url: 'https://verifier.ton.org', description: 'Check that a deployed contract matches its published source.', tags: ['verifier'] },
    { title: 'Contract security guide', url: 'https://docs.ton.org/contracts/techniques/security', description: 'Official security best practices for contracts.', tags: ['docs'] },
    { title: 'TON Audits page', url: 'https://docs.ton.org/audits', description: 'Public security audits of the TON core.', tags: ['security', 'audit'] },
    { title: 'TON Bug Bounty', url: 'https://github.com/ton-blockchain/bug-bounty', description: 'Official bug bounty for the TON core.', tags: ['security', 'bounty'] },
    { title: 'CertiK Skynet: TON', url: 'https://skynet.certik.com/projects/gram', description: 'Security score and monitoring for TON by CertiK.', tags: ['audit'] },
    { title: 'Trail of Bits', url: 'https://www.trailofbits.com', description: 'Security firm that audited the TON core and TVM.', tags: ['audit'] },
    { title: 'Zellic', url: 'https://www.zellic.io', description: 'Security firm that audited tonlib.', tags: ['audit'] },
    { title: 'SlowMist', url: 'https://www.slowmist.com', description: 'Security firm that audited the TON core.', tags: ['audit'] },
    { title: 'TonBit', url: 'https://www.tonbit.xyz', description: 'TON-focused contract auditor.', tags: ['audit'] }
  ]
})
