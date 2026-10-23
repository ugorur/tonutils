import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { changeValidatorBody, parseRoles, validatorStake, withdrawable, withdrawBody } from './logic'

const hash = (c: Cell) => c.hash().toString('hex')

describe('withdraw body', () => {
  // Mainnet tx 83CFMQpdUbih8tIrZXtWS+gCk+PdUGAHLiMLeDHmA/k= (toncenter v3): owner 0:13762B…2994 withdrew 700000 GRAM
  // from single nominator -1:324AC1…EC42 (tonapi get_roles confirms that owner), 1 GRAM attached, compute phase success.
  it('matches a real 700000 GRAM withdrawal', () => {
    expect(hash(withdrawBody(700_000_000_000_000n))).toBe(hash(Cell.fromBase64('te6cckEBAQEAFgAAJwAAEAAAAAAAAAAAAHAnylc1fAAIuFK+zQ==')))
  })
})

describe('change validator body', () => {
  // Layout from ton-blockchain/single-nominator scripts/fift/change-validator.fif: <b 4097 32 u, 1 64 u, to_addr Addr, b>.
  // Expected bits written out by hand: 0x00001001, query_id 1, then addr_std$10 anycast 0, workchain -1 (0xff), 256-bit hash.
  it('follows the official layout', () => {
    const v = Address.parseRaw('-1:95e4e2bdfebecf52dcb210cfd255469198cba8a02160f2ea51b391d473e06f43')
    const c = changeValidatorBody(v)
    const bits = ['00001001', '0000000000000001'].map(h => BigInt(`0x${h}`).toString(2).padStart(h.length * 4, '0')).join('')
      + '100' + '11111111' + BigInt('0x95e4e2bdfebecf52dcb210cfd255469198cba8a02160f2ea51b391d473e06f43').toString(2).padStart(256, '0')
    const s = c.beginParse()
    let got = ''
    while (s.remainingBits) got += s.loadBit() ? '1' : '0'
    expect(got).toBe(bits)
  })
})

describe('get_roles', () => {
  // tonapi GET /v2/blockchain/accounts/-1:c77f91…8e74/methods/get_roles (2026-10-23). tonapi decoded the same stack as
  // owner 0:6ce8da34…bdcd and validator -1:95e4e2bd…6f43; toncenter v3 runGetMethod returned the same cells.
  it('parses owner and validator', () => {
    const roles = parseRoles({
      success: true,
      exit_code: 0,
      stack: [
        { type: 'cell', cell: 'b5ee9c72010101010024000043800d9d1b469f91e15893b4eb7b090d408491a29343044253a5d4f64416040d37b9b0' },
        { type: 'cell', cell: 'b5ee9c720101010100240000439ff2bc9c57bfd7d9ea5b964219fa4aa8d233197514042c1e5d4a36723a8e7c0de870' }
      ]
    })
    expect(roles.owner.toRawString()).toBe('0:6ce8da34fc8f0ac49da75bd8486a04248d149a1822129d2ea7b220b02069bdcd')
    expect(roles.validator.toRawString()).toBe('-1:95e4e2bdfebecf52dcb210cfd255469198cba8a02160f2ea51b391d473e06f43')
  })
  it('rejects non single-nominator contracts', () => {
    expect(() => parseRoles({ success: false, exit_code: 11, stack: [] })).toThrow(/not a single nominator/)
  })
})

describe('balances', () => {
  it('keeps the 1 GRAM storage reserve', () => {
    // tonapi /v2/accounts balance of -1:c77f91…8e74 on 2026-10-23: 21246023343 nano.
    expect(withdrawable(21_246_023_343n)).toBe(20_246_023_343n)
    expect(withdrawable(500_000_000n)).toBe(0n)
  })
  it('finds the stake in the validator set', () => {
    // tonapi /v2/blockchain/validators entry (2026-10-23).
    const list = [{ address: '-1:c77f91f1bd9f779c12346dcea875a6eca9d6506ce3aa3aa91e2d8595b6088e74', stake: 1298528198470000 }]
    expect(validatorStake(list, '-1:C77F91F1BD9F779C12346DCEA875A6ECA9D6506CE3AA3AA91E2D8595B6088E74')).toBe(1298528198470000n)
    expect(validatorStake(list, '-1:00')).toBeNull()
  })
})
