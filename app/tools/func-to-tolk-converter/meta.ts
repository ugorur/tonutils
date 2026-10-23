import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'func-to-tolk-converter',
  name: 'FunC to Tolk converter',
  short: 'Convert FunC contracts to Tolk in your browser, with warnings and a Tolk 1.5 compile check.',
  description: 'Paste one FunC file or a whole project and get the Tolk version, made by the official @ton/convert-func-to-tolk converter. It lists what needs a manual fix, test-compiles the result with Tolk 1.5 and opens it in the compiler playground.',
  category: 'contracts',
  audience: 'dev',
  network: 'offline',
  keywords: ['func', 'tolk', 'convert', 'converter', 'migrate', 'migration', 'transpile', 'convert-func-to-tolk', 'fc to tolk', 'smart contract', 'rewrite'],
  related: ['tolk-func-playground', 'contract-source-verifier-lookup'],
  icon: 'i-lucide-arrow-right-left'
})
