import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'config-proposals',
  name: 'Config proposals and votes',
  short: 'Open proposals to change the TON blockchain config, decoded, with validator vote progress.',
  description: 'See which network config changes validators are voting on: the param, the proposed value next to the current one, votes collected against the ¾ of validator weight needed, rounds won and lost, and expiry. Look at any past block to see earlier votes.',
  category: 'network-stats',
  audience: 'dev',
  network: 'read',
  keywords: ['config proposal', 'vote', 'voting', 'governance', 'config contract', 'list_proposals', 'get_proposal', 'validators vote', 'network upgrade', 'critical params', 'config 11'],
  related: ['config-params-viewer', 'validators-elections', 'network-status'],
  icon: 'i-lucide-vote'
})
