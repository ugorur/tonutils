import { SendMode } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { composeMode, explainReserveMode, explainSendMode, parseMode, RESERVE_BITS, SEND_BASES, SEND_FLAGS, simulateReserve } from './logic'

// Expected values come from independent sources:
// - @ton/core SendMode enum (dist/types/SendMode.d.ts)
// - Tolk stdlib common.tolk (@ton/tolk-js 1.5.0): SEND_MODE_* and RESERVE_MODE_* constants
// - ton-blockchain/ton crypto/block/transaction.cpp: try_action_send_message (mode & ~0xe3, 0xc0 check, ext ~3,
//   0xa0 destroy) and try_action_reserve_currency (result codes 34 / 37, +4/+8/+2/+1 order)
const TOLK: Record<string, number> = {
  SEND_MODE_REGULAR: 0,
  SEND_MODE_PAY_FEES_SEPARATELY: 1,
  SEND_MODE_IGNORE_ERRORS: 2,
  SEND_MODE_BOUNCE_ON_ACTION_FAIL: 16,
  SEND_MODE_DESTROY: 32,
  SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE: 64,
  SEND_MODE_CARRY_ALL_BALANCE: 128,
  RESERVE_MODE_ALL_BUT_AMOUNT: 1,
  RESERVE_MODE_AT_MOST: 2,
  RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE: 4,
  RESERVE_MODE_NEGATE_AMOUNT: 8,
  RESERVE_MODE_BOUNCE_ON_ACTION_FAIL: 16
}

describe('mode constants', () => {
  it('match Tolk stdlib and @ton/core', () => {
    for (const b of [...SEND_BASES, ...SEND_FLAGS, ...RESERVE_BITS]) {
      expect(TOLK[b.tolk], b.tolk).toBe(b.value)
      if (b.tonCore) expect(SendMode[b.tonCore as keyof typeof SendMode], b.tonCore).toBe(b.value)
    }
  })
})

describe('parseMode', () => {
  it('accepts decimal, hex and sums', () => {
    expect(parseMode('3')).toBe(3)
    expect(parseMode('0x80')).toBe(128)
    expect(parseMode('128 + 32')).toBe(160)
    expect(parseMode('64|2')).toBe(66)
  })
  it('rejects junk', () => {
    expect(() => parseMode('abc')).toThrow()
    expect(() => parseMode('')).toThrow()
  })
})

describe('explainSendMode', () => {
  it('composes the standard wallet mode', () => {
    expect(composeMode(0, [SendMode.PAY_GAS_SEPARATELY, SendMode.IGNORE_ERRORS])).toBe(3)
    const i = explainSendMode(3)
    expect(i.valid).toBe(true)
    expect(i.base).toBe(0)
    expect(i.flags).toEqual([1, 2])
  })
  it('rejects 64 + 128 (transaction.cpp: (mode & 0xc0) == 0xc0)', () => {
    expect(explainSendMode(192).valid).toBe(false)
  })
  it('rejects bits 4 and 8 (mode & ~0xe3 after +16 is stripped)', () => {
    expect(explainSendMode(4).valid).toBe(false)
    expect(explainSendMode(8).valid).toBe(false)
    expect(explainSendMode(16 + 2).valid).toBe(true)
  })
  it('flags +32 without 128 as no-op and allows 160', () => {
    expect(explainSendMode(32).notes.some(n => n.text.includes('does nothing'))).toBe(true)
    const i = explainSendMode(160)
    expect(i.valid).toBe(true)
    expect(i.base).toBe(128)
  })
  it('external out messages accept only 0..3', () => {
    expect(explainSendMode(3, { external: true }).valid).toBe(true)
    expect(explainSendMode(64, { external: true }).valid).toBe(false)
  })
  it('64 and 128 carry only the base coin since global version 10 (GlobalVersions.md)', () => {
    expect(explainSendMode(64).notes.some(n => n.text.includes('global version 10'))).toBe(true)
    expect(explainSendMode(128).notes.some(n => n.text.includes('global version 10'))).toBe(true)
    expect(explainSendMode(3).notes.some(n => n.text.includes('global version 10'))).toBe(false)
  })
  it('rejects out of range', () => {
    expect(explainSendMode(256).valid).toBe(false)
  })
})

describe('reserve modes', () => {
  it('+8 without +4 is invalid, bits above 16 invalid', () => {
    expect(explainReserveMode(8).valid).toBe(false)
    expect(explainReserveMode(12).valid).toBe(true)
    expect(explainReserveMode(32).valid).toBe(false)
  })

  const B = (n: number) => BigInt(n)
  it('mode 0 reserves exactly amount, or fails with 37', () => {
    expect(simulateReserve({ mode: 0, amount: B(1), originalBalance: B(5), remaining: B(10) })).toEqual({ ok: true, reserved: B(1), remaining: B(9) })
    expect(simulateReserve({ mode: 0, amount: B(20), originalBalance: B(5), remaining: B(10) }).exitCode).toBe(37)
  })
  it('mode 1 reserves all but amount', () => {
    expect(simulateReserve({ mode: 1, amount: B(1), originalBalance: B(5), remaining: B(10) })).toEqual({ ok: true, reserved: B(9), remaining: B(1) })
  })
  it('mode 2 clamps to the remaining balance', () => {
    expect(simulateReserve({ mode: 2, amount: B(20), originalBalance: B(5), remaining: B(10) })).toEqual({ ok: true, reserved: B(10), remaining: B(0) })
  })
  it('mode 4 adds the original balance, 12 subtracts from it', () => {
    expect(simulateReserve({ mode: 4, amount: B(1), originalBalance: B(5), remaining: B(10) })).toEqual({ ok: true, reserved: B(6), remaining: B(4) })
    expect(simulateReserve({ mode: 12, amount: B(1), originalBalance: B(5), remaining: B(10) })).toEqual({ ok: true, reserved: B(4), remaining: B(6) })
    expect(simulateReserve({ mode: 12, amount: B(6), originalBalance: B(5), remaining: B(10) }).exitCode).toBe(34)
  })
  it('+16 is stripped before the checks; 8 alone fails with 34', () => {
    expect(simulateReserve({ mode: 16, amount: B(1), originalBalance: B(5), remaining: B(10) }).ok).toBe(true)
    expect(simulateReserve({ mode: 8, amount: B(1), originalBalance: B(5), remaining: B(10) }).exitCode).toBe(34)
  })
})
