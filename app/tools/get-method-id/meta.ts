import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'get-method-id',
  name: 'Get-method ID calculator',
  short: 'Get-method name to numeric method_id and back, or list the get-methods of any contract.',
  description: 'Convert a TON get-method name to the numeric id stored in the contract code (crc16 | 0x10000), look up which known getter an id belongs to, or list the method ids a deployed contract exposes.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  keywords: ['method_id', 'method id', 'get method', 'getter', 'crc16', 'runGetMethod', 'seqno', '85143', 'func', 'tolk', 'tact', 'dispatcher', 'DICTPUSHCONST'],
  related: ['get-method-runner', 'contract-inspector', 'tlb-opcode-crc32'],
  icon: 'i-lucide-hash'
})
