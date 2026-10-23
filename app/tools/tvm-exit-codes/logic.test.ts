import { describe, expect, it } from 'vitest'
import { COIN_SYMBOL } from '~/utils/currency'
import { EXIT_CODES, codeRange, lookupExitCode, parseExitCode, searchExitCodes } from './logic'

// Expected values come from the table at docs.ton.org/tvm/exit-codes (read 2026-10-23),
// docs.tact-lang.org/book/exit-codes, and the throw_unless() lines of the linked contract sources.

const title = (code: number, group: string) => lookupExitCode(code).find(e => e.group === group)?.title

describe('exit code table (docs.ton.org)', () => {
  it('has every TVM compute and action code from the docs table', () => {
    const docs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, -14, 14, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 46, 50]
    const ours = EXIT_CODES.filter(e => e.group === 'compute' || e.group === 'action').map(e => e.code)
    expect(ours).toEqual(docs)
  })

  it('matches the docs descriptions', () => {
    expect(title(2, 'compute')).toBe('Stack underflow')
    expect(title(9, 'compute')).toBe('Cell underflow')
    expect(title(13, 'compute')).toBe('Out of gas')
    expect(title(-14, 'compute')).toBe('Out of gas')
    expect(title(33, 'action')).toBe('Action list is too long')
    expect(title(37, 'action')).toBe(`Not enough ${COIN_SYMBOL}`)
    expect(title(50, 'action')).toBe('Account state size exceeded limits')
    expect(title(63, 'compiler')).toMatch(/opcode mismatch/i)
  })

  it('every entry links to docs or a contract source', () => {
    for (const e of EXIT_CODES) expect(e.url).toMatch(/^https:\/\/(docs\.ton\.org|docs\.tact-lang\.org|github\.com\/ton-blockchain)\//)
  })
})

describe('contract codes', () => {
  it('Tact uses 128 … 138', () => {
    expect(EXIT_CODES.filter(e => e.source === 'Tact').map(e => e.code)).toEqual([128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138])
    expect(title(130, 'compiler')).toBe('Invalid incoming message')
  })

  it('wallet v5r1 error constants 132 … 147 (wallet_v5.fc)', () => {
    const w5 = EXIT_CODES.filter(e => e.source.startsWith('Wallet v5r1')).map(e => e.code)
    expect(w5).toEqual(Array.from({ length: 16 }, (_, i) => 132 + i))
    expect(lookupExitCode(133).find(e => e.source.startsWith('Wallet v5r1'))?.title).toBe('Invalid seqno')
  })

  it('35 is ambiguous: action phase, wallet v3/v4 and highload v3 all use it', () => {
    const sources = lookupExitCode(35).map(e => e.source)
    expect(sources).toEqual(['Action phase', 'Wallet v3 / v4', 'Highload wallet v3'])
  })

  it('jetton wallet codes from token-contract jetton-wallet.fc', () => {
    expect(title(705, 'jetton')).toMatch(/not the owner/i)
    expect(title(706, 'jetton')).toMatch(/insufficient jetton balance/i)
    expect(title(709, 'jetton')).toMatch(new RegExp(`not enough ${COIN_SYMBOL}`, 'i'))
  })

  it('NFT collection batch range 403 + n', () => {
    expect(lookupExitCode(404)[0]?.title).toMatch(/batch deploy/i)
    expect(lookupExitCode(652)[0]?.title).toMatch(/batch deploy/i)
    expect(lookupExitCode(653)).toEqual([])
  })
})

describe('parsing and search', () => {
  it('parses decimal, negative and hex', () => {
    expect(parseExitCode('13')).toBe(13)
    expect(parseExitCode(' -14 ')).toBe(-14)
    expect(parseExitCode('0xffff')).toBe(65535)
    expect(parseExitCode('0xFFFF')).toBe(65535)
    expect(parseExitCode('gas')).toBeNull()
    expect(parseExitCode('')).toBeNull()
  })

  it('0xffff is the unknown-op convention', () => {
    expect(searchExitCodes('0xffff').map(e => e.title)).toEqual(['Unknown op code'])
  })

  it('text search matches all words', () => {
    const r = searchExitCodes('out of gas')
    expect(r.map(e => e.code)).toEqual([13, -14])
    expect(searchExitCodes('seqno', 'wallet').map(e => e.code)).toEqual([33, 133])
  })

  it('group filter with empty query lists the group', () => {
    expect(searchExitCodes('', 'action')).toHaveLength(14)
  })

  it('explains ranges for codes not in the table', () => {
    expect(codeRange(120)).toMatch(/reserved for TVM/)
    expect(codeRange(200)).toMatch(/Tact/)
    expect(codeRange(1000)).toMatch(/developer-defined/)
    expect(codeRange(70000)).toMatch(/0 … 65535/)
  })
})
