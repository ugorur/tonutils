import { describe, expect, it } from 'vitest'
import { convertAddress } from './logic'

// Vectors from toncenter /api/v2/detectAddress (independent implementation).
const A = {
  raw: '0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e',
  bUrl: 'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF',
  bStd: 'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff+W72r5gqPrHF',
  nUrl: 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA',
  nStd: 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff+W72r5gqPuwA'
}
const MASTER = {
  raw: '-1:3333333333333333333333333333333333333333333333333333333333333333',
  b: 'Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF',
  n: 'Uf8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMxYA'
}

describe('convertAddress', () => {
  it.each(Object.values(A))('converts %s to every form', (input) => {
    const r = convertAddress(input)
    expect(r.raw).toBe(A.raw)
    expect(r.workchain).toBe(0)
    expect(r.hashHex).toBe(A.raw.slice(2))
    expect(r.mainnet.bounceable).toEqual({ urlSafe: A.bUrl, standard: A.bStd })
    expect(r.mainnet.nonBounceable).toEqual({ urlSafe: A.nUrl, standard: A.nStd })
  })

  it('handles the masterchain', () => {
    const r = convertAddress(MASTER.b)
    expect(r.workchain).toBe(-1)
    expect(r.raw).toBe(MASTER.raw)
    expect(r.mainnet.nonBounceable.urlSafe).toBe(MASTER.n)
    expect(convertAddress(MASTER.raw).mainnet.bounceable.urlSafe).toBe(MASTER.b)
  })

  it('produces testnet forms with kQ / 0Q prefixes that round-trip', () => {
    const r = convertAddress(A.bUrl)
    expect(r.testnet.bounceable.urlSafe.startsWith('kQ')).toBe(true)
    expect(r.testnet.nonBounceable.urlSafe.startsWith('0Q')).toBe(true)
    const back = convertAddress(r.testnet.nonBounceable.urlSafe)
    expect(back.input).toMatchObject({ format: 'friendly', bounceable: false, testOnly: true })
    expect(back.raw).toBe(A.raw)
  })

  it('reports input flags', () => {
    expect(convertAddress(A.raw).input).toEqual({ format: 'raw', bounceable: null, testOnly: null, urlSafe: null })
    expect(convertAddress(A.bUrl).input).toMatchObject({ bounceable: true, testOnly: false, urlSafe: true })
    expect(convertAddress(A.nStd).input).toMatchObject({ bounceable: false, urlSafe: false })
  })

  it('trims whitespace', () => {
    expect(convertAddress(`  ${A.bUrl}\n`).raw).toBe(A.raw)
  })

  it.each([
    '',
    'hello',
    '0:1234',
    'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHX' // bad checksum
  ])('rejects %j', (input) => {
    expect(() => convertAddress(input)).toThrow()
  })
})
