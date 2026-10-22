import { describe, expect, it } from 'vitest'
import { OP, OPCODES, opcodeInfo, opHex, parseOp } from './opcodes'

describe('opcodes table', () => {
  it('has unique op codes and names', () => {
    expect(new Set(OPCODES.map(o => o.op)).size).toBe(OPCODES.length)
    expect(new Set(OPCODES.map(o => o.name)).size).toBe(OPCODES.length)
  })

  // Values as printed in TEP-74 / TEP-62 / TEP-81 (github.com/ton-blockchain/TEPs)
  it.each([
    ['jetton_transfer', 0x0f8a7ea5],
    ['jetton_transfer_notification', 0x7362d09c],
    ['jetton_internal_transfer', 0x178d4519],
    ['excesses', 0xd53276db],
    ['jetton_burn', 0x595f07bc],
    ['jetton_burn_notification', 0x7bdd97de],
    ['nft_transfer', 0x5fcc3d14],
    ['nft_ownership_assigned', 0x05138d91],
    ['dns_change_record', 0x4eb1f0f9]
  ])('%s = %s', (name, op) => {
    expect(OP(name)).toBe(op)
    expect(opcodeInfo(op)?.name).toBe(name)
  })

  it('TL-B snippets carry their own op code', () => {
    for (const o of OPCODES.filter(o => o.tlb)) {
      expect(o.tlb, o.name).toContain(`#${opHex(o.op).slice(2)}`)
    }
  })
})

describe('parseOp / opHex', () => {
  it.each([
    ['0x0f8a7ea5', 0x0f8a7ea5],
    ['0F8A7EA5', 0x0f8a7ea5],
    ['260734629', 0x0f8a7ea5],
    ['-718113061', 0xd53276db], // signed int32 form used by some explorers
    ['zz', null]
  ])('%s', (input, op) => {
    expect(parseOp(input)).toBe(op)
  })

  it('pads to 8 hex digits', () => {
    expect(opHex(0x05138d91)).toBe('0x05138d91')
    expect(opHex(-718113061)).toBe('0xd53276db')
  })
})
