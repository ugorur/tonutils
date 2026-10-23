import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tlb-opcode-crc32',
  name: 'TL-B opcode (crc32) calculator',
  short: 'Compute the crc32 op code of a TL-B constructor and check explicit #tags.',
  description: 'Paste a TL-B constructor or a whole schema to get its implicit crc32 tag, the TEP-74 style op with the top bit cleared, a check of any explicit #tag, and ready-to-paste Tolk, FunC and Tact constants.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'offline',
  keywords: ['tl-b', 'tlb', 'crc32', 'op code', 'opcode', 'op', 'tag', 'constructor', 'tlbc', 'tep-74', 'message', 'internal message body', 'func', 'tolk', 'tact'],
  related: ['tlb-playground', 'tlb-codegen', 'get-method-id'],
  icon: 'i-lucide-tag'
})
