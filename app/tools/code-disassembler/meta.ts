import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'code-disassembler',
  name: 'Smart contract disassembler',
  short: 'Turn contract code (address or BOC) into readable TVM assembly, method by method; diff two contracts',
  description: 'Paste a contract address or a code BOC to see its TVM assembly: recv_internal, recv_external and every get-method by name, with library cells resolved. Compare two contracts method by method. Runs in your browser with @ton/tasm.',
  category: 'contracts',
  audience: 'dev',
  network: 'read',
  keywords: ['disassembler', 'decompiler', 'tvm', 'fift', 'asm', 'tasm', 'assembly', 'opcode', 'bytecode', 'code boc', 'get methods', 'method id', 'diff', 'compare contracts', 'library cell'],
  related: ['fift-asm-assembler', 'local-get-method-emulator', 'library-cell-resolver', 'contract-inspector'],
  icon: 'i-lucide-binary'
})
