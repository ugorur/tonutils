import type { Cell } from '@ton/core'
import { codeMethods, methodNames, type CodeMethod, type Tasm } from '~/lib/tvm-wasm/code'

export interface Disassembly {
  hashHex: string
  /** Full TASM text (parses back with the TVM assembler tool), with `// name` after each known method id. */
  text: string
  methods: (Omit<CodeMethod, 'instructions'> & { text: string, lines: number })[]
}

/** Appends `// name` to the top-level `    <id> => {` lines of the method dictionary. */
export function annotateMethods(text: string, names: Map<number, string>): string {
  return text.replace(/^ {4}(-?\d+) => \{$/gm, (line, id: string) => {
    const n = names.get(Number(id))
    return n ? `${line} // ${n}` : line
  })
}

/** Disassembles code into TASM text (the @ton/tasm format; round-trips to the same cell hash). */
export function disassemble(tasm: Tasm, code: Cell, extraNames: { id: number, method: string }[] = []): Disassembly {
  const names = methodNames(extraNames)
  const instrs = tasm.runtime.decompileCell(code)
  const methods = codeMethods(instrs, names).map(({ instructions, ...m }) => {
    const text = tasm.text.print(instructions).trimEnd()
    return { ...m, text, lines: text.split('\n').length }
  })
  return { hashHex: code.hash().toString('hex'), text: annotateMethods(tasm.text.print(instrs).trimEnd(), names), methods }
}

export type DiffLine = { op: ' ' | '+' | '-', text: string }

/** Line diff (LCS). Null when the inputs are too large to diff in the browser. */
export function diffLines(a: string, b: string, maxCells = 4_000_000): DiffLine[] | null {
  const A = a.split('\n')
  const B = b.split('\n')
  let pre = 0
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++
  let suf = 0
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++
  const a2 = A.slice(pre, A.length - suf)
  const b2 = B.slice(pre, B.length - suf)
  const n = a2.length
  const m = b2.length
  // ponytail: O(n*m) LCS table, fine for per-method diffs; switch to Myers if whole-program diffs of huge contracts matter.
  if ((n + 1) * (m + 1) > maxCells) return null
  const L = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * (m + 1) + j] = a2[i] === b2[j] ? L[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(L[(i + 1) * (m + 1) + j]!, L[i * (m + 1) + j + 1]!)
    }
  }
  const mid: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a2[i] === b2[j]) { mid.push({ op: ' ', text: a2[i]! }); i++; j++ }
    else if (L[(i + 1) * (m + 1) + j]! >= L[i * (m + 1) + j + 1]!) mid.push({ op: '-', text: a2[i++]! })
    else mid.push({ op: '+', text: b2[j++]! })
  }
  while (i < n) mid.push({ op: '-', text: a2[i++]! })
  while (j < m) mid.push({ op: '+', text: b2[j++]! })
  return [...A.slice(0, pre).map(text => ({ op: ' ' as const, text })), ...mid, ...A.slice(A.length - suf).map(text => ({ op: ' ' as const, text }))]
}

export interface MethodDiff {
  id: number
  name: string | null
  status: 'same' | 'changed' | 'added' | 'removed'
  diff: DiffLine[] | null
}

export interface CodeComparison {
  identical: boolean
  /** Per method, when both sides use a method dictionary. */
  methods: MethodDiff[]
  /** Whole-program diff when neither side has a method dictionary. */
  whole: DiffLine[] | null
}

/** Compares two disassemblies method by method (A = base, B = other). */
export function compareCode(a: Disassembly, b: Disassembly): CodeComparison {
  if (a.hashHex === b.hashHex) return { identical: true, methods: [], whole: null }
  if (!a.methods.length || !b.methods.length) return { identical: false, methods: [], whole: diffLines(a.text, b.text) }
  const ids = [...new Set([...a.methods.map(m => m.id), ...b.methods.map(m => m.id)])]
  const methods = ids.map((id): MethodDiff => {
    const ma = a.methods.find(m => m.id === id)
    const mb = b.methods.find(m => m.id === id)
    const name = ma?.name ?? mb?.name ?? null
    if (!ma) return { id, name, status: 'added', diff: null }
    if (!mb) return { id, name, status: 'removed', diff: null }
    if (ma.text === mb.text) return { id, name, status: 'same', diff: null }
    return { id, name, status: 'changed', diff: diffLines(ma.text, mb.text) }
  })
  const order = { changed: 0, added: 1, removed: 2, same: 3 }
  methods.sort((x, y) => order[x.status] - order[y.status] || x.id - y.id)
  return { identical: false, methods, whole: null }
}
