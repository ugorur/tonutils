import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'fift-asm-assembler',
  name: 'TVM assembler',
  short: 'Assemble TVM assembly (TASM or the Fift PROGRAM{…} that FunC/Tolk emit) into a code BOC and hash.',
  description: 'Write TVM assembly or paste the Fift assembly FunC and Tolk produce, and get the code cell as a BOC with its hash, size and a disassembly round-trip check. Runs offline in your browser with @ton/tasm.',
  category: 'contracts',
  audience: 'dev',
  network: 'offline',
  keywords: ['assembler', 'fift', 'fift asm', 'tasm', 'tvm', 'assembly', 'code boc', 'code hash', 'PROGRAM{', 'compile', 'opcodes', 'bytecode'],
  related: ['code-disassembler', 'local-get-method-emulator', 'tolk-func-playground'],
  icon: 'i-lucide-hammer'
})
