import type { Cell } from '@ton/core'
import type { Tasm } from '~/lib/tvm-wasm/code'

export type AsmMode = 'tasm' | 'fift'

/** Fift assembly (FunC/Tolk output) is wrapped in PROGRAM{ … }END>c; everything else is TASM. */
export const detectMode = (src: string): AsmMode => (/PROGRAM\{/.test(src) ? 'fift' : 'tasm')

/** @ton/tasm's Fift-asm compiler (not re-exported from the package root). Lazy: only Fift mode needs it. */
export async function loadFift() {
  const [p, c] = await Promise.all([import('@ton/tasm/dist/fift/parse/parse'), import('@ton/tasm/dist/fift/compile')])
  return { parse: p.parse, compile: c.compile }
}
export type Fift = Awaited<ReturnType<typeof loadFift>>

export interface Assembled {
  cell: Cell
  boc64: string
  hex: string
  hashHex: string
  hashBase64: string
  cells: number
  bits: number
  /** Disassembly of the result (TASM), for the round-trip check. */
  roundTrip: string
}

function stats(root: Cell) {
  const seen = new Set<string>()
  let bits = 0
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    bits += c.bits.length
    c.refs.forEach(walk)
  }
  walk(root)
  return { cells: seen.size, bits }
}

/** Assembles TASM text or Fift assembly into a code cell. Throws readable errors with line numbers. */
export function assemble(tasm: Tasm, fift: Fift | null, src: string, mode: AsmMode = detectMode(src)): Assembled {
  if (!src.trim()) throw new Error('Write or paste some assembly first.')
  let instrs: ReturnType<Tasm['runtime']['decompileCell']>
  if (mode === 'fift') {
    if (!fift) throw new Error('Fift compiler not loaded')
    // compile() calls process.exit on a syntax error, so parse first and report it ourselves.
    const p = fift.parse('input.fif', src)
    if (p.$ === 'ParseFailure') {
      const pos = p.error.position?.start
      // The parser lists every token it would accept; only the unexpected one helps.
      const msg = p.error.message.replace(/^Expected [\s\S]* but (.+) found\.?$/, 'unexpected $1')
      throw new Error(`Syntax error${pos ? ` at line ${pos.line}, column ${pos.column}` : ''}: ${msg}`)
    }
    try {
      instrs = fift.compile('input.fif', src)
    }
    catch (e) {
      const msg = (e as Error).message
      // An unknown instruction is the user's typo; anything else is likely Fift outside the supported PROGRAM{} subset.
      throw new Error(/Unexpected instruction/.test(msg)
        ? `Fift assembly: ${msg}. Check the spelling against the TVM instruction list.`
        : `Fift assembly: ${msg}. Only the PROGRAM{ … }END>c form that FunC and Tolk emit is supported.`)
    }
  }
  else {
    const p = tasm.text.parse('input.tasm', src)
    if (p.$ === 'ParseFailure') {
      const line = p.error.loc.line
      const text = src.split('\n')[line]?.trim()
      throw new Error(`Line ${line + 1}${text ? ` (${text})` : ''}: ${p.error.msg}. TASM uses explicit forms such as PUSHINT_4 5 / PUSHINT_8 100 / PUSHINT_LONG 10000; for "5 PUSHINT" style paste a full PROGRAM{ … }END>c.`)
    }
    instrs = p.instructions
  }
  let cell: Cell
  try {
    cell = tasm.runtime.compileCell(instrs)
  }
  catch (e) {
    const msg = (e as Error).message
    if (mode === 'fift' && /empty dictionary/.test(msg)) {
      throw new Error('The program has no entry point. Declare recv_internal / recv_external (DECLPROC) or a get-method (DECLMETHOD); procedures that nothing calls are left out.')
    }
    throw new Error(`Could not encode the instructions: ${msg}`)
  }
  const boc = cell.toBoc()
  return {
    cell,
    boc64: boc.toString('base64'),
    hex: boc.toString('hex'),
    hashHex: cell.hash().toString('hex'),
    hashBase64: cell.hash().toString('base64'),
    ...stats(cell),
    roundTrip: tasm.text.print(tasm.runtime.decompileCell(cell)).trimEnd()
  }
}
