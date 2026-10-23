import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tlb-codegen',
  name: 'TL-B to TypeScript generator',
  short: 'Turn a TL-B schema into typed TypeScript load/store functions for @ton/core.',
  description: 'Paste a TL-B schema and get TypeScript types plus load and store functions that work with @ton/core, generated in your browser with the official tlb-codegen. Copy or download the file.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['tl-b', 'tlb', 'codegen', 'code generator', 'typescript', 'ts', '@ton/core', 'serializer', 'deserializer', 'load', 'store', 'schema', 'block.tlb', 'tlb-codegen'],
  related: ['tlb-playground', 'tlb-opcode-crc32', 'boc-converter'],
  icon: 'i-lucide-code-xml'
})
