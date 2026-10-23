// Replacement for @ton/convert-func-to-tolk's dist/parse-func-source.js (ESM, wasm passed as bytes instead of URLs,
// so it works the same in the browser and in Node tests).
import TreeSitter from './tree-sitter.js'

let parser

export async function initFunCParserOnce(treeSitterWasm, funcGrammarWasm) {
  if (parser) return
  await TreeSitter.init({ wasmBinary: treeSitterWasm })
  const p = new TreeSitter()
  p.setLanguage(await TreeSitter.Language.load(funcGrammarWasm))
  p.setTimeoutMicros(1000 * 1000)
  parser = p
}

export function parseFunCSource(funcSource) {
  if (!parser) throw new Error('initFunCParserOnce() has not been called')
  return parser.parse(funcSource).rootNode
}

export default { initFunCParserOnce, parseFunCSource }
