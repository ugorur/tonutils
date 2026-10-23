import { describe, expect, it } from 'vitest'
import type { TonapiSearchItem } from './logic'
import { classifyInput, groupResults, lookalikeOf, parseResult } from './logic'

// tonapi GET /v2/accounts/search?name=fragment (mainnet, 2026-10-22), 8 of 66 items, previews dropped.
const FRAGMENT: TonapiSearchItem[] = [
  { address: '0:51e0b3fdcf68ebf26462e53ceaab6c022ccb41b0becfe3a767b53ff6140a867d', name: 'FRAGMENT · jetton', trust: 'whitelist' },
  { address: '0:43512860d54980cf24d59868a30e679927fb1373c10964db7500edcdf690abc4', name: 'Fragment · account', trust: 'whitelist' },
  { address: '0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a', name: 'Fragment · account', trust: 'whitelist' },
  { address: '0:158136239adb15dd59df90c641f9efd312cfeb8664f218f4c3e5fce9d95e6c07', name: 'Fragment Gift Minter · account', trust: 'whitelist' },
  { address: '0:7dbd909223a2f51f1ce5c517334fc16900515354515a985d8cd4dc50a7b2807b', name: 'fragment-support.ton · account', trust: 'none' },
  { address: '0:31f8d9ee6b81c7765027b1ba53fd9c2486af2390bb1b8ed85cf1d5e66481989d', name: 'fragmentix.t.me · account', trust: 'none' },
  { address: '0:3a4d2191094e3a33d4601efa51bb52dc5baa354516e162b7706955385f8144a7', name: 'FragmentChecker · jetton', trust: 'none' },
  { address: '0:234f0c689b9718df672d00719b7b78d1f3ac0067c12c11b0e72c452cd604bd1d', name: 'Fragment NFTs · collection', trust: 'none' }
]

describe('classifyInput', () => {
  it('detects addresses, names and too-short text', () => {
    expect(classifyInput('UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI')).toEqual({ kind: 'address', raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8' })
    expect(classifyInput(' binance ')).toEqual({ kind: 'text', q: 'binance', domain: false })
    expect(classifyInput('foundation.ton')).toEqual({ kind: 'text', q: 'foundation.ton', domain: true })
    // tonapi rejects names shorter than 3: "len 2 less than minimum 3"
    expect(classifyInput('xx')).toEqual({ kind: 'short' })
    expect(classifyInput('   ')).toEqual({ kind: 'empty' })
  })
})

describe('parseResult', () => {
  it('splits the "name · kind" label', () => {
    expect(parseResult(FRAGMENT[0]!)).toEqual({ raw: FRAGMENT[0]!.address, title: 'FRAGMENT', kind: 'jetton', verified: true, domain: false, image: undefined })
    expect(parseResult(FRAGMENT[4]!)).toMatchObject({ title: 'fragment-support.ton', kind: 'account', verified: false, domain: true })
    expect(parseResult(FRAGMENT[7]!)).toMatchObject({ title: 'Fragment NFTs', kind: 'collection' })
    expect(parseResult({ address: '0:AB', name: 'Odd', trust: 'none' })).toMatchObject({ raw: '0:ab', title: 'Odd', kind: 'other' })
  })
})

describe('groupResults', () => {
  const g = groupResults(FRAGMENT, 'Fragment')
  it('puts verified exact matches first, accounts before tokens', () => {
    expect(g.verified.map(r => `${r.title}/${r.kind}`)).toEqual(['Fragment/account', 'Fragment/account', 'FRAGMENT/jetton', 'Fragment Gift Minter/account'])
    expect(g.unverified.map(r => r.title)).toEqual(['fragment-support.ton', 'fragmentix.t.me', 'FragmentChecker', 'Fragment NFTs'])
  })
  it('drops exact repeats', () => {
    expect(groupResults([...FRAGMENT, FRAGMENT[1]!], 'x').verified).toHaveLength(4)
  })
  it('flags unverified lookalikes of verified names', () => {
    expect(lookalikeOf(g.unverified[0]!, g.verified)).toBe('Fragment')
    expect(lookalikeOf(g.verified[0]!, g.verified)).toBeUndefined()
    expect(lookalikeOf(parseResult({ address: '0:01', name: 'durov2.ton · account', trust: 'none' }), g.verified)).toBeUndefined()
  })
})
