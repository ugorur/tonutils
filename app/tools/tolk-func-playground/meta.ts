import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tolk-func-playground',
  name: 'Tolk / FunC compiler playground',
  short: 'Compile Tolk or FunC in your browser: Fift, code BOC, code hash, deploy address and get methods.',
  description: 'Compile Tolk 1.5 or FunC 0.4.6 smart contracts right in the browser, with multi-file projects and the standard library built in. Get the Fift assembly, code BOC, code hash and deploy address, run get methods in a local TVM, and share the project as a link.',
  category: 'contracts',
  audience: 'dev',
  network: 'offline',
  keywords: ['tolk', 'func', 'compiler', 'compile', 'playground', 'ide', 'wasm', 'fift', 'code boc', 'code hash', 'smart contract', 'blueprint', 'compiled.json', 'stdlib.fc', 'get method', 'tvm', 'deploy address'],
  related: ['func-to-tolk-converter', 'contract-address-from-stateinit', 'get-method-runner', 'contract-source-verifier-lookup'],
  icon: 'i-lucide-square-terminal',
  featured: true
})
