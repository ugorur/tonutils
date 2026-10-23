import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tvm-instruction-reference',
  name: 'TVM instruction reference',
  short: 'Search all 912 TVM instructions by mnemonic or bytecode: stack effect, gas and encoding.',
  description: 'Searchable reference of every TVM (codepage 0) instruction from the community tvm-spec: Fift mnemonic, bytecode prefix, stack effect, gas, category and the TVM version that added it. Paste hex to see which instruction it starts with.',
  category: 'reference',
  audience: 'dev',
  network: 'offline',
  keywords: ['tvm', 'instruction', 'opcode', 'asm', 'assembler', 'fift', 'bytecode', 'mnemonic', 'gas cost', 'stack', 'tvm-spec', 'cp0', 'ACCEPT', 'SENDRAWMSG', 'PUSHINT'],
  related: ['code-disassembler', 'fift-asm-assembler', 'tvm-exit-codes', 'func-tolk-tact-cheatsheets'],
  icon: 'i-lucide-cpu'
})
