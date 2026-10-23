import { beginCell, Cell, contractAddress, storeStateInit, type TupleItem } from '@ton/core'
import type { Lang, SourceFile } from '~/lib/compilers/files'
import { parseBoc } from '~/utils/ton/messages'

export interface GetMethodInfo {
  name: string
  /** Number of parameters; only 0-arg methods get a Run button. */
  params: number
  /** TVM method id when the source sets it (Tolk ABI always; FunC `method_id(n)`); otherwise crc16(name). */
  id?: number
}

export interface CompileSuccess {
  ok: true
  lang: Lang
  codeBoc64: string
  codeHashHex: string
  codeHashB64: string
  fiftCode: string
  /** Compiler warnings / stderr, empty when clean. */
  warnings: string
  getMethods: GetMethodInfo[]
  /** FunC: include paths that received the bundled stdlib.fc. */
  addedStdlib: string[]
  ms: number
}

export type CompileOutput = CompileSuccess | { ok: false, lang: Lang, message: string, ms: number }

// Minimal shapes of the tolk-js / func-js results (the full types live in the worker modules).
type TolkResult = { status: 'ok', codeBoc64: string, fiftCode: string, stderr?: string, abiJson: Record<string, unknown> } | { status: 'error', message: string }
type FuncResult = { status: 'ok', codeBoc: string, fiftCode: string, warnings?: string } | { status: 'error', message: string }

const hashes = (codeBoc64: string) => {
  const h = Cell.fromBase64(codeBoc64).hash()
  return { codeHashHex: h.toString('hex'), codeHashB64: h.toString('base64') }
}

/** Get methods from Tolk's ABI (`abiJson.get_methods`). The ABI also lists `fun main()` (id 0, the message entrypoint): not a getter. */
export function tolkGetMethods(abi: Record<string, unknown>): GetMethodInfo[] {
  const list = Array.isArray(abi.get_methods) ? abi.get_methods as { name: string, tvm_method_id?: number, parameters?: unknown[] }[] : []
  return list.filter(m => m.tvm_method_id !== 0 && m.tvm_method_id !== -1).map(m => ({ name: m.name, params: m.parameters?.length ?? 0, id: m.tvm_method_id }))
}

/** Get methods declared with `method_id` in FunC sources (ignores comments and forward declarations). */
export function funcGetMethods(files: SourceFile[]): GetMethodInfo[] {
  const out = new Map<string, GetMethodInfo>()
  for (const f of files) {
    const src = f.content.replace(/\{-[\s\S]*?-\}/g, '').replace(/;;.*$/gm, '')
    for (const m of src.matchAll(/([A-Za-z_][\w?!']*)\s*\(([^()]*)\)\s*(?:impure\s+|inline\s+|inline_ref\s+)*method_id\b(?:\s*\(\s*([^)]*?)\s*\))?\s*\{/g)) {
      const params = m[2]!.trim() ? m[2]!.split(',').length : 0
      const id = m[3] ? Number(m[3]) : Number.NaN
      out.set(m[1]!, Number.isInteger(id) ? { name: m[1]!, params, id } : { name: m[1]!, params })
    }
  }
  return [...out.values()]
}

export function fromTolk(r: TolkResult, ms: number): CompileOutput {
  if (r.status !== 'ok') return { ok: false, lang: 'tolk', message: r.message, ms }
  return { ok: true, lang: 'tolk', codeBoc64: r.codeBoc64, ...hashes(r.codeBoc64), fiftCode: r.fiftCode, warnings: (r.stderr ?? '').trim(), getMethods: tolkGetMethods(r.abiJson), addedStdlib: [], ms }
}

export function fromFunc(r: FuncResult, files: SourceFile[], addedStdlib: string[], ms: number): CompileOutput {
  if (r.status !== 'ok') return { ok: false, lang: 'func', message: r.message, ms }
  return { ok: true, lang: 'func', codeBoc64: r.codeBoc, ...hashes(r.codeBoc), fiftCode: r.fiftCode, warnings: (r.warnings ?? '').trim(), getMethods: funcGetMethods(files), addedStdlib, ms }
}

/** Initial data: empty input means an empty cell. Accepts base64 or hex BOC. */
export const parseData = (input: string): Cell => (input.trim() ? parseBoc(input.trim()) : beginCell().endCell())

export interface DeployInfo {
  bounceable: string
  nonBounceable: string
  raw: string
  stateInitBoc: string
}

/** Contract address and StateInit for code + initial data, the same way blueprint's `contractAddress` does it. */
export function deployInfo(codeBoc64: string, data: Cell, workchain: number, testOnly: boolean): DeployInfo {
  const init = { code: Cell.fromBase64(codeBoc64), data }
  const addr = contractAddress(workchain, init)
  return {
    bounceable: addr.toString({ bounceable: true, testOnly }),
    nonBounceable: addr.toString({ bounceable: false, testOnly }),
    raw: addr.toRawString(),
    stateInitBoc: beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64')
  }
}

/** Blueprint `build/<Name>.compiled.json` contents. */
export function compiledJson(codeBoc64: string): string {
  const c = Cell.fromBase64(codeBoc64)
  return JSON.stringify({ hash: c.hash().toString('hex'), hashBase64: c.hash().toString('base64'), hex: c.toBoc().toString('hex') }, null, 2)
}

export type StackJson = string | null | StackJson[] | { [k: string]: StackJson }

/** Get-method result stack as plain JSON: ints as decimal strings, cells/slices/builders as base64 BOC. */
export function stackToJson(stack: TupleItem[]): StackJson[] {
  return stack.map((i): StackJson => {
    switch (i.type) {
      case 'int': return i.value.toString()
      case 'null': return null
      case 'nan': return 'NaN'
      case 'tuple': return stackToJson(i.items)
      case 'cell':
      case 'slice':
      case 'builder': return { [i.type]: i.cell.toBoc().toString('base64') }
    }
  })
}
