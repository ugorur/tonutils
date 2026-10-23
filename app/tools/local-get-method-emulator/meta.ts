import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'local-get-method-emulator',
  name: 'Local get-method emulator',
  short: 'Run get-methods in a local TVM with your own balance, time, data or code: gas, exit code and VM log.',
  description: 'Fetch a contract\'s code, data and libraries once, then run any get-method in a WebAssembly TVM in your browser. Override balance, time, data or code to ask "what if", and see gas used, the exit code and the full VM log, with no API rate limits.',
  category: 'contracts',
  audience: 'dev',
  network: 'read',
  keywords: ['emulator', 'sandbox', 'tvm', 'wasm', 'get method', 'runGetMethod', 'gas', 'vm log', 'debug', 'what if', 'state override', 'c7', 'library cell', 'exit code'],
  related: ['get-method-runner', 'code-disassembler', 'fift-asm-assembler', 'tvm-stack-codec'],
  icon: 'i-lucide-cpu'
})
