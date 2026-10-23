import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'send-mode-calculator',
  name: 'Send mode & reserve mode calculator',
  short: 'Compose or decode SENDRAWMSG send modes (3, 64, 128 + 32…) and RAWRESERVE modes.',
  description: 'Tick flags to build a TON send mode or reserve mode, or paste a number to decode it. Shows what the node does with it, invalid combinations, the Tolk/FunC/@ton/core constants, and simulates raw_reserve on a balance.',
  category: 'reference',
  audience: 'dev',
  network: 'offline',
  keywords: ['send mode', 'sendmode', 'send_raw_message', 'SENDRAWMSG', 'mode 3', 'mode 64', 'mode 128', 'mode 160', 'raw_reserve', 'RAWRESERVE', 'reserve mode', 'pay fees separately', 'ignore errors', 'carry all balance', 'destroy', 'bounce on action fail', 'SendMode', 'flags'],
  related: ['message-emulator', 'tx-retracer'],
  icon: 'i-lucide-sliders-horizontal'
})
