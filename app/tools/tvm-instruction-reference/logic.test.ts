import * as tasm from '@ton/tasm'
import { describe, expect, it } from 'vitest'
import { ALIASES, INSTRUCTIONS, decodeBits, decodeHex, hexToBits, looksLikeHex, searchInstructions } from './logic'

// Vectors: TVM whitepaper / docs.ton.org instruction table (ACCEPT = F800, SETCP0 = FF00, ADD = A0, NOP = 00,
// SENDRAWMSG = FB00, NEWC = C8, ENDC = C9), and an independent assembler (@ton/tasm) used as an oracle.

describe('bundled cp0 table', () => {
  it('has the full tvm-spec instruction set', () => {
    expect(INSTRUCTIONS.length).toBe(912)
    expect(ALIASES.length).toBe(82)
  })
})

describe('hexToBits', () => {
  it('handles plain hex, Fift x{…} and completion tags', () => {
    expect(hexToBits('F8')).toBe('11111000')
    expect(hexToBits('x{A0}')).toBe('10100000')
    expect(hexToBits('8F_')).toBe('1000111') // 1000 1111 → drop trailing zeros + last 1
    expect(hexToBits('C_')).toBe('1')
    expect(() => hexToBits('zz')).toThrow()
  })
})

describe('decode bytecode prefix (docs.ton.org vectors)', () => {
  it.each([
    ['F800', 'ACCEPT'],
    ['FF00', 'SETCP'],
    ['A0', 'ADD'],
    ['00', 'NOP'],
    ['01', 'XCHG_0I'], // SWAP is s1 XCHG0
    ['FB00', 'SENDRAWMSG'],
    ['C8', 'NEWC'],
    ['C9', 'ENDC'],
    ['70', 'PUSHINT_4'], // 0 PUSHINT
    ['F2D4_', 'THROWIF']
  ])('%s → %s', (hex, m) => {
    expect(decodeHex(hex)?.instruction.m).toBe(m)
  })

  it('empty input decodes to nothing', () => {
    expect(decodeBits('')).toBeNull()
  })
})

describe('agrees with @ton/tasm for every operand-free instruction', () => {
  const plain = INSTRUCTIONS.filter(i => !i.t.includes(':') && /^[A-Z0-9_]+$/.test(i.f) && i.v !== 9999)
  it(`compiles and decodes ${plain.length} instructions`, () => {
    let checked = 0
    for (const ins of plain) {
      const parsed = tasm.text.parse('t.tasm', ins.f)
      if (parsed.$ !== 'ParseSuccess') continue
      const bits = tasm.runtime.compileCell(parsed.instructions).bits.toString()
      expect(decodeHex(bits)?.instruction.f, `${ins.f} → ${bits}`).toBe(ins.f)
      checked++
    }
    expect(checked).toBeGreaterThan(400)
  })
})

describe('search', () => {
  it('ranks exact mnemonic first', () => {
    expect(searchInstructions('accept')[0]?.m).toBe('ACCEPT')
    expect(searchInstructions('SENDRAWMSG')[0]?.m).toBe('SENDRAWMSG')
  })

  it('resolves aliases', () => {
    expect(searchInstructions('DUP')[0]?.m).toBe('PUSH') // DUP = s0 PUSH
    expect(searchInstructions('SWAP')[0]?.m).toBe('XCHG_0I')
  })

  it('searches descriptions and filters by category', () => {
    expect(searchInstructions('gas limit').map(i => i.m)).toContain('ACCEPT')
    expect(searchInstructions('', 'app_gas').every(i => i.c === 'app_gas')).toBe(true)
  })

  it('detects hex queries', () => {
    expect(looksLikeHex('F800')).toBe(true)
    expect(looksLikeHex('x{8F_}')).toBe(true)
    expect(looksLikeHex('ACCEPT')).toBe(false)
    expect(looksLikeHex('ADD')).toBe(false) // a mnemonic made of hex letters
    expect(looksLikeHex('DEC')).toBe(false)
  })
})
