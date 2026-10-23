import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'languages',
  title: 'Languages & TVM',
  description: 'Tolk, Tact, FunC, Fift, TL-B and the TON Virtual Machine reference.',
  icon: 'i-lucide-code',
  order: 9,
  links: [
    { title: 'Tolk language overview', url: 'https://docs.ton.org/tolk/overview', description: 'Official docs for Tolk, the recommended language for new contracts.', tags: ['tolk'] },
    { title: 'Tolk vs FunC', url: 'https://docs.ton.org/tolk/from-func/tolk-vs-func', description: 'What changes when moving a contract from FunC to Tolk.', tags: ['tolk', 'func'] },
    { title: 'Tolk changelog', url: 'https://docs.ton.org/tolk/changelog', description: 'Release history of the Tolk compiler.', tags: ['tolk'] },
    { title: 'Tolk examples', url: 'https://docs.ton.org/tolk/examples', description: 'Example contracts written in Tolk.', tags: ['tolk', 'examples'] },
    { title: 'Tact language', url: 'https://tact-lang.org', description: 'High-level, type-safe language for TON contracts.', tags: ['tact'] },
    { title: 'Tact documentation', url: 'https://docs.tact-lang.org', description: 'Official Tact documentation.', tags: ['tact', 'docs'] },
    { title: 'Tact compiler GitHub', url: 'https://github.com/tact-lang/tact', description: 'Source code of the Tact compiler.', tags: ['tact', 'github'] },
    { title: 'FunC language docs', url: 'https://docs.ton.org/languages/func/overview', description: 'Docs for FunC, the original C-like contract language.', tags: ['func'] },
    { title: 'FunC cookbook', url: 'https://docs.ton.org/languages/func/cookbook', description: 'FunC snippets for common tasks.', tags: ['func'] },
    { title: 'Fift language docs', url: 'https://docs.ton.org/languages/fift/overview', description: 'Stack-based scripting and assembler language for the TVM.', tags: ['fift'] },
    { title: 'TL-B overview', url: 'https://docs.ton.org/foundations/tlb/overview', description: 'Schema language for serializing data into cells.', tags: ['tlb'] },
    { title: 'TVM overview', url: 'https://docs.ton.org/tvm/overview', description: 'Official reference for the TON Virtual Machine.', tags: ['tvm'] },
    { title: 'TVM instructions', url: 'https://docs.ton.org/tvm/instructions', description: 'Full list of TVM instructions.', tags: ['tvm'] },
    { title: 'TVM exit codes', url: 'https://docs.ton.org/tvm/exit-codes', description: 'Standard TVM exit and error codes.', tags: ['tvm', 'debug'] }
  ]
})
