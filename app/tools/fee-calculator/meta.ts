import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'fee-calculator',
  name: 'Fee calculator (gas, forward, storage)',
  short: 'Exact TON gas, message forward and storage fees from the live network config.',
  description: 'Work out the gas fee, message forward fee (with the sender/receiver split) and storage fee of a TON transaction from the live config params 18, 20, 21, 24 and 25, using the same rounding as the validators. Paste a message BOC to count its cells.',
  category: 'network-stats',
  audience: 'both',
  network: 'read',
  keywords: ['fee', 'fees', 'gas', 'gas fee', 'gas price', 'forward fee', 'fwd_fee', 'first_frac', 'lump price', 'storage fee', 'cell price', 'config 18', 'config 20', 'config 21', 'config 24', 'config 25', 'how much does a transaction cost', 'nanoTON', 'nanoGRAM', 'transaction cost', 'computeFwdFees', 'computeGasPrices'],
  related: ['storage-rent-estimator', 'message-emulator', 'send-mode-calculator', 'tx-retracer'],
  icon: 'i-lucide-calculator'
})
