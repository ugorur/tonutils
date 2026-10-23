import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { chunk, expiryLevel, renewMessages } from './logic'

// Real renewals of .ton items (toncenter v3 /transactions, mainnet):
//   fire.ton  0:963ebb…e65c, tx iDvDWjjkwJSObMYLoFTePSAHNmeZKs8Jv3/Yw3HQxP4= : 0.02 GRAM, query_id 0, exit 0
//   maybe.ton 0:ce050e…f8ee, tx oXS4jdlVnU20XnCbh1VF+HVg2pN2F0wFW1nnQECuNgY= : 0.02 GRAM, query_id 1760523779, exit 0
const FIRE = '0:963ebb44505714095eec3683f066bd7360950be208efe2c730b3235585d7e65c'
const MAYBE = '0:ce050e49630605841f2ec5fba4194e1b6bd126324ab7d9d78e082d714867f8ee'
const h = (c: unknown) => (typeof c === 'string' ? Cell.fromBase64(c) : c as Cell).hash().toString('hex')

describe('renewMessages', () => {
  it('reproduces real renew transactions byte for byte', () => {
    const [a] = renewMessages([FIRE], false)
    expect(a!.amount).toBe(20_000_000n)
    expect(h(a!.payload)).toBe(h('te6cckEBAQEALgAAWE6x8PkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMPrTzw=='))
    const [b] = renewMessages([MAYBE], false, 1_760_523_779n)
    expect(h(b!.payload)).toBe(h('te6cckEBAQEALgAAWE6x8PkAAAAAaO92AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZsfd/g=='))
  })
  it('sends bounceable, network-flagged addresses', () => {
    const [m, t] = [renewMessages([FIRE], false)[0]!, renewMessages([FIRE], true)[0]!]
    expect(m.address.startsWith('EQ')).toBe(true)
    expect(t.address.startsWith('kQ')).toBe(true)
    expect(Address.parse(m.address).toRawString()).toBe(FIRE)
  })
})

describe('batching and expiry', () => {
  it('chunks by the wallet limit', () => {
    expect(chunk([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3, 4], [5]])
    expect(chunk([], 4)).toEqual([])
  })
  it('classifies expiry', () => {
    const now = 1_792_699_200
    expect(expiryLevel(now - 1, now)).toBe('expired')
    expect(expiryLevel(now + 86_400 * 10, now)).toBe('soon')
    expect(expiryLevel(now + 86_400 * 200, now)).toBe('ok')
  })
})
