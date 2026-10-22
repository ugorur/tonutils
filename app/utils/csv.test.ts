import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

// Quoting rules from RFC 4180 §2 (fields with comma, quote or line break are quoted; quotes doubled).
describe('toCsv', () => {
  it('quotes per RFC 4180', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'line\nbreak' }])).toBe('a,b,c\r\n"x,y","say ""hi""","line\nbreak"\r\n')
  })

  it('handles bigint, null and missing keys', () => {
    expect(toCsv([{ amount: 10n ** 20n, memo: null }, { amount: 1n, extra: true }])).toBe('amount,memo,extra\r\n100000000000000000000,,\r\n1,,true\r\n')
  })

  it('respects column order', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b', 'a'])).toBe('b,a\r\n2,1\r\n')
  })
})
