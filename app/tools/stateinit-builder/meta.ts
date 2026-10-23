import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'stateinit-builder',
  name: 'StateInit builder and decoder',
  short: 'Build a StateInit with libraries, tick-tock and fixed prefix, or decode one from a deploy message.',
  description: 'Decode a StateInit, or pull it out of a deploy message, and see its address, code (wallet version, library reference), data, libraries and flags. Or build one from code, data, libraries, tick/tock and fixed_prefix_length, and copy the base64 for a TonConnect deploy message.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['stateinit', 'state_init', 'state init', 'init', 'deploy', 'storeStateInit', 'loadStateInit', 'contractAddress', 'library', 'library cell', 'SimpleLib', 'tick tock', 'split_depth', 'fixed_prefix_length', 'TonConnect stateInit', 'code', 'data'],
  related: ['contract-address-from-stateinit', 'dictionary-codec', 'library-cell-resolver'],
  icon: 'i-lucide-package-plus'
})
