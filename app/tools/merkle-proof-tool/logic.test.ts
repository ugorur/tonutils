import { Address, beginCell, Cell, Dictionary } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { HMSTR_CLAIMS, HMSTR_ROOT } from './examples'
import { buildProof, buildUpdate, claimPayload, inspectProof } from './logic'

const AIRDROP = { keySpec: 'address', valueSpec: 'amount:coins, start_from:uint48, expired_at:uint48', layout: 'direct' as const }

describe('inspectProof: real HMSTR mintless claims (TEP-176)', () => {
  it.each(HMSTR_CLAIMS)('claim $tx proves the minter root and the claimed amount', (c) => {
    const r = inspectProof(c.payload, { expectedRoot: HMSTR_ROOT, dict: AIRDROP })
    expect(r.kind).toBe('proof')
    expect(r.wrapper).toMatch(/TEP-176/)
    expect(r.proof.hash).toBe(HMSTR_ROOT.slice(2))
    expect(r.expected).toBe('match')
    expect(r.proof.pruned.length).toBeGreaterThan(10)
    // exactly one leaf survives: the claimant, with the amount toncenter reports as transferred
    expect(r.proof.entries).toHaveLength(1)
    const e = r.proof.entries![0]!
    expect(Address.parse(e.key).toRawString()).toBe(c.owner)
    expect((e.value as { amount: string }).amount).toBe(c.amount)
  })

  it('accepts the bare proof cell and base64/decimal roots', () => {
    const proof = Cell.fromBase64(HMSTR_CLAIMS[0]!.payload).refs[0]!
    const b64 = Buffer.from(HMSTR_ROOT.slice(2), 'hex').toString('base64')
    const r = inspectProof(proof.toBoc().toString('hex'), { expectedRoot: b64 })
    expect(r.wrapper).toBeNull()
    expect(r.expected).toBe('match')
    expect(inspectProof(proof.toBoc().toString('base64'), { expectedRoot: BigInt(HMSTR_ROOT).toString() }).expected).toBe('match')
  })

  it('flags a different expected root', () => {
    expect(inspectProof(HMSTR_CLAIMS[0]!.payload, { expectedRoot: '00'.repeat(32) }).expected).toBe('mismatch')
  })

  it('rejects a proof whose content was tampered with', () => {
    const proof = Cell.fromBase64(HMSTR_CLAIMS[0]!.payload).refs[0]!
    const boc = proof.toBoc({ idx: false, crc32: false })
    boc[boc.length - 1]! ^= 1 // flip one bit in the last cell: the stored root hash no longer matches
    expect(() => inspectProof(boc.toString('base64'))).toThrow(/could not be parsed/)
  })

  it('rebuilds the exact on-chain claim payload around the proof', () => {
    const payload = Cell.fromBase64(HMSTR_CLAIMS[0]!.payload)
    expect(claimPayload(payload.refs[0]!).equals(payload)).toBe(true)
  })

  it('explains when there is no Merkle cell', () => {
    expect(() => inspectProof(beginCell().storeUint(1, 8).endCell().toBoc().toString('base64'))).toThrow(/No Merkle proof/)
  })
})

// tsTON content dict (see dictionary-codec tests): its Hashmap root hash is fixed by the chain.
const TSTON_CONTENT = 'te6cckEBDAEA7AABAwDAAQIBIAIEAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZAAwBQAGh0dHBzOi8vdG9uc3Rha2Vycy5jb20vamV0dG9uL21ldGEuanNvbgIBIAUKAgEgBggBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwcAHgBUb25zdGFrZXJzIFRPTgFBv27U+UKnhIziywZrd6ESjGof+MQ/Q4otziRhK6n/q4sDCQAMAHRzVE9OAUK/roD9Lx4DSA4igjY1lu51LXuyf1B3a5UIagJ5GJZ1kj4LAAQAOUBccxw='
const META = { keySpec: 'sha256', valueSpec: 'content', layout: 'tep64' as const }

describe('buildProof', () => {
  const chainRoot = Cell.fromBase64(TSTON_CONTENT).refs[0]!.hash().toString('hex')

  it('proves one key of a real on-chain dictionary against its on-chain root', () => {
    const r = buildProof({ boc: TSTON_CONTENT }, META, ['symbol'])
    expect(r.rootHash).toBe(chainRoot)
    const back = inspectProof(r.proof.toBoc().toString('base64'), { expectedRoot: chainRoot, dict: { ...META, layout: 'direct' } })
    expect(back.expected).toBe('match')
    expect(back.proof.entries).toEqual([{ key: 'symbol', value: 'tsTON' }])
  })

  it('builds the same proof from JSON as from the BOC', () => {
    const json = JSON.stringify({ uri: 'https://tonstakers.com/jetton/meta.json', name: 'Tonstakers TON', symbol: 'tsTON', decimals: '9' })
    const a = buildProof({ json }, META, ['name', 'decimals'])
    const b = buildProof({ boc: TSTON_CONTENT }, META, ['name', 'decimals'])
    expect(a.proof.equals(b.proof)).toBe(true)
    expect(a.rootHash).toBe(chainRoot)
  })

  it('rejects keys that are not in the dictionary', () => {
    expect(() => buildProof({ boc: TSTON_CONTENT }, META, ['image'])).toThrow(/not in the dictionary/)
    expect(() => buildProof({ boc: TSTON_CONTENT }, META, [])).toThrow(/at least one key/)
  })
})

describe('buildUpdate', () => {
  // @ton/core Dictionary.spec vector: uint8 → uint32 {1: 11, …, 5: 55}; old root ee41b86b…
  const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(32))
  for (let k = 1; k <= 5; k++) dict.set(k, k * 11)
  const boc = beginCell().storeDictDirect(dict).endCell().toBoc().toString('base64')
  const opts = { keySpec: 'uint8', valueSpec: 'uint32', layout: 'direct' as const }

  it('commits to the old root and the new root', () => {
    const r = buildUpdate({ boc }, opts, '3', '66')
    expect(r.oldHash).toBe('ee41b86bd71f8224ebd01848b4daf4cd46d3bfb3e119d8b865ce7c2802511de3')
    const changed = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(32))
    for (let k = 1; k <= 5; k++) changed.set(k, k === 3 ? 66 : k * 11)
    expect(r.newHash).toBe(beginCell().storeDictDirect(changed).endCell().hash().toString('hex'))
    const back = inspectProof(r.update.toBoc().toString('base64'), { expectedRoot: r.newHash, dict: opts })
    expect(back.kind).toBe('update')
    expect(back.expected).toBe('new')
    expect(back.update!.entries).toEqual([{ key: '3', value: '66' }])
    expect(back.proof.entries).toEqual([{ key: '3', value: '33' }])
  })

  it('keeps bare numbers exact (no JSON.parse rounding)', () => {
    const d64 = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.BigUint(64))
    d64.set(1, 1n)
    const src = { boc: beginCell().storeDictDirect(d64).endCell().toBoc().toString('base64') }
    const r = buildUpdate(src, { keySpec: 'uint8', valueSpec: 'uint64', layout: 'direct' }, '1', '18446744073709551615')
    d64.set(1, 18446744073709551615n)
    expect(r.newHash).toBe(beginCell().storeDictDirect(d64).endCell().hash().toString('hex'))
  })

  it('validates the new value', () => {
    expect(() => buildUpdate({ boc }, opts, '3', '-1')).toThrow()
    expect(() => buildUpdate({ boc }, opts, '9', '1')).toThrow(/not in the dictionary/)
  })
})
