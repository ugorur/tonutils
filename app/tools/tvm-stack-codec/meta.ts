import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tvm-stack-codec',
  name: 'TVM stack converter',
  short: 'Convert get-method stacks between toncenter v2/v3, tonapi, @ton/core and VmStack BOC. Build args.',
  description: 'Paste a get-method result or arguments in any format (toncenter v2 or v3, tonapi, @ton/core TupleItem JSON or a serialized VmStack BOC) and get it in every other format, with numbers, addresses and cells shown readably. Or build get-method arguments and copy the exact request body for each API.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['tvm stack', 'stack', 'tuple', 'VmStack', 'get method', 'runGetMethod', 'toncenter', 'tonapi', 'TupleBuilder', 'TupleReader', 'serializeTuple', 'parseTuple', 'tvm.Slice', 'tinyint', 'int257', 'arguments'],
  related: ['dictionary-codec', 'get-method-runner', 'local-get-method-emulator'],
  icon: 'i-lucide-layers'
})
