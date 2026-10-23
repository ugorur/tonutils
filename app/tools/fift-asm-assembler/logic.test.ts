import * as tasm from '@ton/tasm'
import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { assemble, detectMode, loadFift } from './logic'
import usdt from '../code-disassembler/fixtures/usdt-master-inspect.json'
import funcFx from './fixtures/func-counter.json'
import tolkFx from './fixtures/tolk-counter.json'

// Independent vectors:
// - tolk-counter.json / func-counter.json: Fift assembly and code BOC produced by the official compilers
//   (@ton/tolk-js 1.5.0, @ton-community/func-js 0.4.6) from the source stored next to them.
// - usdt-master-inspect.json: tonapi /v2/blockchain/accounts/EQCxE6…sDs/inspect `disassembled_code` and the on-chain code hash.
// - README_BOC: the example BOC in the @ton/tasm README (`tdisasm -s …`).
const README_BOC = 'b5ee9c72410102010027000114ff008e83f4a413ed43d901002fa64ce73b5134348034c7f487f4fffd0115501b05485b1460ec17065c'

describe('Fift mode (FunC / Tolk output)', async () => {
  const fift = await loadFift()

  it.each([['Tolk', tolkFx], ['FunC', funcFx]])('%s Fift assembly assembles to the compiler\'s own code hash', (_, fx) => {
    expect(detectMode(fx.fift)).toBe('fift')
    const r = assemble(tasm, fift, fx.fift)
    expect(r.hashHex).toBe(fx.codeHashHex)
    expect(r.hashHex).toBe(Cell.fromBase64(fx.codeBoc64).hash().toString('hex'))
  })

  it('reports syntax errors with a position instead of exiting', () => {
    expect(() => assemble(tasm, fift, 'PROGRAM{\n  main PROC:<{ \n}END>c', 'fift')).toThrow(/^Syntax error at line 3, column 1: unexpected "}"$/)
  })

  it('explains a program without an entry point instead of an encoder error', () => {
    expect(() => assemble(tasm, fift, 'PROGRAM{\n  DECLPROC foo\n  foo PROC:<{\n    INC\n  }>\n}END>c')).toThrow(/no entry point/)
  })

  it('reports unknown instructions', () => {
    expect(() => assemble(tasm, fift, 'PROGRAM{\n  DECLPROC main\n  main PROC:<{\n    FOO\n  }>\n}END>c')).toThrow(/Unexpected instruction: FOO\. Check the spelling/)
  })
})

describe('TASM mode', () => {
  it('tonapi\'s disassembly of the USD₮ master assembles to the on-chain code hash', () => {
    expect(detectMode(usdt.disassembled_code)).toBe('tasm')
    const r = assemble(tasm, null, usdt.disassembled_code)
    expect(r.hashHex).toBe(usdt.code_hash)
    expect(r.boc64).toBe(Cell.fromHex(usdt.code).toBoc().toString('base64'))
    expect(r.roundTrip).toBe(usdt.disassembled_code.trimEnd())
  })

  it('round-trips the @ton/tasm README example BOC', () => {
    const cell = Cell.fromHex(README_BOC)
    const text = tasm.text.print(tasm.runtime.decompileCell(cell))
    const r = assemble(tasm, null, text)
    expect(r.hashHex).toBe(cell.hash().toString('hex'))
    expect(r.cells).toBe(2)
  })

  it('assembles a tiny program and counts its bits (PUSHINT_4 = 8 bits, ADD = 8 bits: TVM spec opcodes 7x and A0)', () => {
    const r = assemble(tasm, null, 'PUSHINT_4 1\nPUSHINT_4 2\nADD')
    expect(r.cell.bits.toString()).toBe('7172A0')
    expect(r.bits).toBe(24)
  })

  it('points at the failing line (1-based) and explains TASM vs Fift syntax', () => {
    expect(() => assemble(tasm, null, 'PUSHINT_4 1\nFOO\nADD')).toThrow(/^Line 2 \(FOO\): Unexpected instruction: FOO/)
    expect(() => assemble(tasm, null, 'ADD\nADD\nPUSHINT_4 x')).toThrow(/^Line 3 \(PUSHINT_4 x\).*PUSHINT_8 100/)
    expect(() => assemble(tasm, null, '  ')).toThrow(/Write or paste/)
  })
})
