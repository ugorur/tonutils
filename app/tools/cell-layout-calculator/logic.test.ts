import { describe, expect, it } from 'vitest'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { forEachUniqueCell } from '~/lib/boc-basics/boc'
import { EXT_MSG1_BOC, INT_MSG2_BOC } from '~/lib/boc-basics/vectors'
import { computeLayout, estimateFees, fieldSize, forwardFee, PRESETS, storageFee } from './logic'

const ADDR = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')

/** Bits and cells of a message excluding its root cell (how the network counts forward fees). */
function msgSize(boc: string) {
  const root = Cell.fromBase64(boc)
  let bits = 0
  let cells = 0
  forEachUniqueCell(root.refs, (c) => {
    bits += c.bits.length
    cells++
  })
  return { bits, cells }
}

describe('fieldSize matches TL-B and @ton/core serialization', () => {
  it('address is 267 bits, addr_none 2', () => {
    expect(fieldSize({ name: 'a', type: 'address' })).toMatchObject({ minBits: 267, maxBits: 267 })
    expect(beginCell().storeAddress(ADDR).endCell().bits.length).toBe(267)
    expect(fieldSize({ name: 'a', type: 'address-opt' })).toMatchObject({ minBits: 2, maxBits: 267 })
    expect(beginCell().storeAddress(null).endCell().bits.length).toBe(2)
  })

  it('coins spans 4..124 bits', () => {
    expect(fieldSize({ name: 'c', type: 'coins' })).toMatchObject({ minBits: 4, maxBits: 124 })
    expect(beginCell().storeCoins(0n).endCell().bits.length).toBe(4)
    expect(beginCell().storeCoins((1n << 120n) - 1n).endCell().bits.length).toBe(124)
    expect(beginCell().storeCoins(toNano('1')).endCell().bits.length).toBe(4 + 8 * 4)
  })

  it('VarUInteger 32 has 5 length bits and up to 31 bytes', () => {
    expect(fieldSize({ name: 'v', type: 'varuint', n: 32 })).toMatchObject({ minBits: 5, maxBits: 5 + 248 })
    expect(beginCell().storeVarUint(0n, 5).endCell().bits.length).toBe(5)
  })

  it('rejects out-of-range N', () => {
    expect(() => fieldSize({ name: 'x', type: 'uint', n: 300 })).toThrow(/1–256/)
  })
})

describe('computeLayout', () => {
  it('jetton wallet storage fits one cell: 4+124..+267+267 bits, 1 ref', () => {
    const l = computeLayout(PRESETS[0]!.fields)
    expect(l.fits).toBe(true)
    expect(l.total).toEqual({ minBits: 538, maxBits: 658, minRefs: 1, maxRefs: 1 })
    expect(l.plan).toHaveLength(1)
  })

  it('jetton transfer body worst case (TEP-74) is 32+64+124+267+267+1+124+1 bits', () => {
    const l = computeLayout(PRESETS[1]!.fields)
    expect(l.total.maxBits).toBe(880)
    expect(l.total.maxRefs).toBe(2)
    expect(l.fits).toBe(true)
  })

  it('splits an oversized layout into a chain that respects 1023 bits / 4 refs', () => {
    const l = computeLayout(PRESETS[3]!.fields)
    expect(l.fits).toBe(false)
    expect(l.total.maxBits).toBe(4 * 267 + 124 + 16 + 32 + 8)
    expect(l.plan.length).toBe(2)
    for (const c of l.plan) {
      expect(c.maxBits).toBeLessThanOrEqual(1023)
      expect(c.maxRefs).toBeLessThanOrEqual(4)
    }
    expect(l.plan[0]!.fields.map(f => f.field.name)).toEqual(['buyer', 'seller', 'arbiter'])
    expect(l.plan.flatMap(c => c.fields).length).toBe(PRESETS[3]!.fields.length)
  })

  it('splits when there are more than 4 refs', () => {
    const l = computeLayout(Array.from({ length: 6 }, (_, i) => ({ name: `r${i}`, type: 'ref' as const })))
    expect(l.fits).toBe(false)
    expect(l.plan.map(c => c.maxRefs)).toEqual([4, 3])
  })
})

// On-chain vectors (toncenter v3, 2026-10-22) with the mainnet ConfigParam 25 (tonapi).
describe('forwardFee matches real mainnet messages', () => {
  it('TX2 out message: 1 extra cell of 427 bits -> total_fwd_fees 101801, fwd_fee 67868', () => {
    const s = msgSize(INT_MSG2_BOC)
    expect(s).toEqual({ bits: 427, cells: 1 })
    expect(forwardFee(s.bits, s.cells)).toEqual({ total: 101801n, fwdFee: 67868n })
  })

  it('TX1 out message with an empty body: lump price only -> 66667 total, fwd_fee 44446', () => {
    expect(forwardFee(0, 0)).toEqual({ total: 66667n, fwdFee: 44446n })
  })

  it('an external message (TX1 in_msg) has more extra cells than the internal one', () => {
    expect(msgSize(EXT_MSG1_BOC).cells).toBeGreaterThan(1)
  })
})

describe('storageFee', () => {
  it('basechain: 135 nano per cell per 65536 s, bits free since utime 1777500000', () => {
    // ceil(135 * 31536000 / 65536) = ceil(64962.1...) = 64963
    expect(storageFee(1000, 1, 365 * 24 * 3600)).toBe(64963n)
    // masterchain: ceil((1000*1000 + 500000) * 86400 / 65536) = ceil(1977539.06) = 1977540
    expect(storageFee(1000, 1, 86400, 'masterchain')).toBe(1977540n)
  })

  it('estimateFees counts every planned cell for storage and forwarding (body sent as a ref)', () => {
    const l = computeLayout(PRESETS[3]!.fields)
    const f = estimateFees(l)
    expect(f.cells).toBe(2)
    expect(f.forward).toEqual(forwardFee(l.plan[0]!.maxBits + l.plan[1]!.maxBits, 2))
    // TX2's out message carries its 427-bit body as a ref: a 1-cell, 427-bit layout must give toncenter's 101801 total.
    const body = computeLayout([{ name: 'body', type: 'bits', n: 427 }])
    expect(estimateFees(body).forward).toEqual({ total: 101801n, fwdFee: 67868n })
  })
})
