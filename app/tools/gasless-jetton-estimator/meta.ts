import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'gasless-jetton-estimator',
  name: 'Gasless jetton transfer estimator',
  short: 'See which jettons can pay their own fees and what a gasless transfer costs in that token.',
  description: 'Lists the jettons tonapi\'s gasless relayer accepts as fee payment and gets a live quote for a transfer from your W5 wallet: the relayer fee in the jetton and the exact messages it would relay. Estimate only; nothing is signed or sent.',
  category: 'jettons',
  audience: 'both',
  network: 'read',
  keywords: ['gasless', 'battery', 'relayer', 'pay fees in usdt', 'no gram', 'no ton for gas', 'commission', 'tonapi', 'w5', 'v5r1', 'jetton transfer fee', 'usdt'],
  related: ['gasless-send', 'send-jetton', 'jetton-transfer-builder'],
  icon: 'i-lucide-fuel'
})
