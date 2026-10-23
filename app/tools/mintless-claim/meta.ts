import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'mintless-claim',
  name: 'Mintless airdrop claim',
  short: 'Check if your address has a mintless jetton airdrop and claim it with your wallet.',
  description: 'Looks up your mintless (TEP-177) airdrop through the issuer\'s claim API, verifies the proof locally against the jetton\'s Merkle root, shows the amount and claim window, and claims it with one transaction approved in your wallet.',
  category: 'jettons',
  audience: 'user',
  network: 'wallet',
  keywords: ['mintless', 'airdrop', 'claim', 'claim airdrop', 'hmstr', 'hamster kombat', 'eligibility', 'merkle proof', 'custom payload', 'tep-177', 'unclaimed jettons'],
  related: ['mintless-jetton-airdrop-builder'],
  icon: 'i-lucide-gift'
})
