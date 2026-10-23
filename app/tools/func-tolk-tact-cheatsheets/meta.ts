import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'func-tolk-tact-cheatsheets',
  name: 'FunC / Tolk / Tact cheat sheets',
  short: 'Side-by-side Tolk, FunC and Tact: messages, cells, storage, send modes and the FunC→Tolk map.',
  description: 'Side-by-side cheat sheets for TON smart contract languages: handling and sending messages, building and parsing cells, storage, get-methods, errors, send and reserve modes, and a FunC to Tolk standard library map. Every Tolk and FunC example compiles.',
  category: 'reference',
  audience: 'dev',
  network: 'offline',
  keywords: ['func', 'tolk', 'tact', 'cheat sheet', 'cheatsheet', 'smart contract', 'send mode', 'reserve mode', 'send_raw_message', 'createMessage', 'stdlib', 'migration', 'recv_internal', 'onInternalMessage'],
  related: ['tolk-func-playground', 'func-to-tolk-converter', 'send-mode-calculator', 'tvm-instruction-reference'],
  icon: 'i-lucide-scroll-text'
})
