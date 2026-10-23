import { describe, expect, it } from 'vitest'
import { convert, detectFormat } from './logic'

// RFC 4648 section 10 test vectors ("foobar").
const FOOBAR = { utf8: 'foobar', hex: '666f6f626172', base64: 'Zm9vYmFy', base32: 'mzxw6ytboi' }

// Wallet v4R2 code hash, as published in the TON docs / ton-core (base64) and tonviewer (hex).
const V4R2 = {
  base64: '/rX/aCDi/w2Ug+fg1iyBfYRniftK5YDIeIZtlZ2r1cA=',
  base64url: '_rX_aCDi_w2Ug-fg1iyBfYRniftK5YDIeIZtlZ2r1cA',
  hex: 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0'
}

// Account hash -> friendly forms, from toncenter /api/v2/detectAddress.
const ACCOUNT = {
  hex: 'ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e',
  bounceable: 'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF',
  nonBounceable: 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA'
}

describe('convert', () => {
  it('matches RFC 4648 vectors from every direction', () => {
    for (const [fmt, value] of Object.entries(FOOBAR)) {
      const r = convert(value, fmt as keyof typeof FOOBAR)
      expect(r.out.utf8).toBe('foobar')
      expect(r.out.hex).toBe(FOOBAR.hex)
      expect(r.out.base64).toBe(FOOBAR.base64)
      expect(r.out.base32).toBe(FOOBAR.base32)
    }
    // Padded upper-case base32 as RFC 4648 prints it.
    expect(convert('MZXW6YTBOI======', 'base32').out.utf8).toBe('foobar')
  })

  it('matches the ton-core base32 test vector (ADNL alphabet)', () => {
    const hex = '2d45061c1d4ec44a937d0318589e13c73d151d1cef5d3c0e53afbcf56a6c2fe2bd74bb'
    const b32 = 'fvcqmha5j3ceve35ammfrhqty46rkhi455otydstv66pk2tmf7rl25f3'
    expect(convert(hex, 'hex').out.base32).toBe(b32)
    expect(convert(b32, 'base32').out.hex).toBe(hex)
  })

  it('converts a code hash between base64, base64url and hex', () => {
    const r = convert(V4R2.base64, 'base64')
    expect(r.out.hex).toBe(V4R2.hex)
    expect(r.out.base64url).toBe(V4R2.base64url)
    expect(r.out.utf8).toBeNull()
    expect(convert(V4R2.base64url, 'base64url').out.base64).toBe(V4R2.base64)
    // Either alphabet is accepted in either field.
    expect(convert(V4R2.base64url, 'base64').out.hex).toBe(V4R2.hex)
    expect(convert(`0x${V4R2.hex.toUpperCase()}`, 'hex').out.base64).toBe(V4R2.base64)
  })

  it('reads 32 bytes as an account hash', () => {
    const r = convert(ACCOUNT.hex, 'hex')
    expect(r.address).toEqual({ raw: `0:${ACCOUNT.hex}`, bounceable: ACCOUNT.bounceable, nonBounceable: ACCOUNT.nonBounceable })
    expect(convert('abcd', 'hex').address).toBeNull()
  })

  it('handles big integers (2^256 - 1)', () => {
    const max = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
    expect(convert(max, 'decimal').out.hex).toBe('ff'.repeat(32))
    expect(convert('ff'.repeat(32), 'hex').out.decimal).toBe(max)
    expect(convert('255', 'decimal').out.hex).toBe('ff')
    expect(convert('256', 'decimal').out.bytes).toBe('[1, 0]')
  })

  it('parses byte arrays', () => {
    expect(convert('[102, 111, 0x6f, 98, 97, 114]', 'bytes').out.utf8).toBe('foobar')
  })

  it.each([
    ['abc', 'hex', /even number/],
    ['xyz', 'hex', /0-9 and a-f/],
    ['Zm9vY', 'base64', /impossible length/],
    ['Zm9v*', 'base64', /may only contain/],
    ['abc1', 'base32', /a-z and 2-7/],
    ['-5', 'decimal', /non-negative/],
    ['[1, 300]', 'bytes', /not a byte/],
    ['  ', 'hex', /Enter a value/]
  ] as const)('rejects %j as %s', (input, fmt, msg) => {
    expect(() => convert(input, fmt)).toThrow(msg)
  })
})

describe('detectFormat', () => {
  it.each([
    [V4R2.hex, 'hex'],
    ['0x1234', 'hex'],
    [V4R2.base64, 'base64'],
    [V4R2.base64url, 'base64url'],
    ['fvcqmha5j3ceve35ammfrhqty46rkhi455otydstv66pk2tmf7rl25f3', 'base32'],
    ['115792089237316195423570985008687907853269984665640564039457584007913129639935', 'decimal'],
    ['[1, 2, 3]', 'bytes'],
    [`${V4R2.base64.slice(0, 20)}\n${V4R2.base64.slice(20)}\n`, 'base64'],
    ['hello world', 'utf8'],
    ['Password', 'utf8']
  ])('%s -> %s', (input, fmt) => {
    expect(detectFormat(input)).toBe(fmt)
  })
})
