import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'config-params-viewer',
  name: 'Blockchain config viewer',
  short: 'Every TON config param decoded: fees, gas, limits, validators, version. Diff with past blocks.',
  description: 'Read the TON blockchain configuration in plain English: gas and message prices, storage fees, size limits, election timings, stake limits, protocol version and system contracts, with the raw BOC of each param. Compare the config with any earlier block or date to see what changed.',
  category: 'network-stats',
  audience: 'dev',
  network: 'read',
  keywords: ['config', 'blockchain config', 'config params', 'ConfigParam', 'getConfigParam', 'getConfigAll', 'gas price', 'param 20', 'param 21', 'param 24', 'param 25', 'storage prices', 'size limits', 'global version', 'capabilities', 'block.tlb', 'diff'],
  related: ['config-proposals', 'network-status', 'tlb-playground', 'validators-elections'],
  icon: 'i-lucide-sliders-horizontal'
})
