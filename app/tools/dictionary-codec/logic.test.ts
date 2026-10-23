import { Address, beginCell, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildDictionary, decodeDictionary } from './logic'

// tsTON jetton master EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav: content cell = ref 0 of the account data
// read from toncenter /api/v3/account on 2026-10-22. Expected fields: toncenter /api/v3/jetton/masters jetton_content.
const TSTON_CONTENT = 'te6cckEBDAEA7AABAwDAAQIBIAIEAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZAAwBQAGh0dHBzOi8vdG9uc3Rha2Vycy5jb20vamV0dG9uL21ldGEuanNvbgIBIAUKAgEgBggBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwcAHgBUb25zdGFrZXJzIFRPTgFBv27U+UKnhIziywZrd6ESjGof+MQ/Q4otziRhK6n/q4sDCQAMAHRzVE9OAUK/roD9Lx4DSA4igjY1lu51LXuyf1B3a5UIagJ5GJZ1kj4LAAQAOUBccxw='
const TSTON_META = { uri: 'https://tonstakers.com/jetton/meta.json', name: 'Tonstakers TON', symbol: 'tsTON', decimals: '9' }

// hGRAM master EQDPdq8xjAhytYqfGSX8KcFWIReCufsB9Wdg0pLlYSO_h76w: get_jetton_data stack[3] from toncenter
// /api/v3/runGetMethod; fields from toncenter /api/v3/jetton/masters.
const HGRAM_CONTENT = 'te6cckECDwEAASgAAQMAwAECASACAwFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAQCASAFBgA+AGh0dHBzOi8vaGlwby5maW5hbmNlL2hncmFtLnN2ZwIBIAcIAgEgCwwBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwkBQb9u1PlCp4SM4ssGa3ehEoxqH/jEP0OKLc4kYSup/6uLAwoAIgBIaXBvIFN0YWtlZCBHUkFNAAwAaEdSQU0BQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCQ0BQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQ4AMABIaXBvIGxpcXVpZCBzdGFrZWQgR1JBTQAEADktdi/F'
const HGRAM_META = { decimals: '9', description: 'Hipo liquid staked GRAM', image: 'https://hipo.finance/hgram.svg', name: 'Hipo Staked GRAM', symbol: 'hGRAM' }

const asObject = (entries: { key: string, value: unknown }[]) => Object.fromEntries(entries.map(e => [e.key, e.value]))

describe('decodeDictionary: TEP-64 on-chain metadata', () => {
  it.each([
    ['tsTON', TSTON_CONTENT, TSTON_META],
    ['hGRAM', HGRAM_CONTENT, HGRAM_META]
  ])('decodes %s content like toncenter', (_, boc, meta) => {
    const r = decodeDictionary(boc, 'sha256', 'content', 'auto')
    expect(r.layout).toBe('tep64')
    expect(r.warnings).toBe(0)
    expect(asObject(r.entries)).toEqual(meta)
  })

  it.each([
    ['tsTON', TSTON_CONTENT, TSTON_META],
    ['hGRAM', HGRAM_CONTENT, HGRAM_META]
  ])('rebuilds the exact on-chain %s content cell from JSON', (_, boc, meta) => {
    const built = buildDictionary(JSON.stringify(meta), 'sha256', 'content')
    expect(built.tep64.hash().toString('hex')).toBe(Cell.fromBase64(boc).hash().toString('hex'))
  })

  it('round-trips through its own JSON output', () => {
    const r = decodeDictionary(TSTON_CONTENT, 'sha256', 'content', 'tep64')
    expect(buildDictionary(r.json, 'sha256', 'content').tep64.equals(Cell.fromBase64(TSTON_CONTENT))).toBe(true)
  })

  it('warns when the value type is wrong instead of inventing data', () => {
    const r = decodeDictionary(TSTON_CONTENT, 'sha256', 'uint8', 'tep64')
    expect(r.warnings).toBe(4)
  })

  it('auto-detects empty on-chain content (TEP-64: 0x00 + empty HashmapE = 9 bits, no refs)', () => {
    const empty = beginCell().storeUint(0, 8).storeBit(0).endCell().toBoc().toString('base64')
    const r = decodeDictionary(empty, 'sha256', 'content', 'auto')
    expect(r.layout).toBe('tep64')
    expect(r.entries).toEqual([])
  })

  it('rejects an off-chain (0x01) content cell in tep64 layout', () => {
    const offchain = beginCell().storeUint(1, 8).storeStringTail('https://x').endCell().toBoc().toString('base64')
    expect(() => decodeDictionary(offchain, 'sha256', 'content', 'tep64')).toThrow(/0x1/)
  })
})

describe('decodeDictionary: generic', () => {
  // TL-B / TVM whitepaper example (also @ton/core Dictionary.spec): uint16 → uint16 {13: 169, 17: 289, 239: 57121}.
  const bits = (b: ReturnType<typeof beginCell>, s: string) => {
    for (const c of s) b.storeBit(c === '1')
    return b
  }
  const root = bits(beginCell(), '11001000')
    .storeRef(bits(beginCell(), '011000')
      .storeRef(bits(beginCell(), '1010011010000000010101001').endCell())
      .storeRef(bits(beginCell(), '1010000010000000100100001').endCell())
      .endCell())
    .storeRef(bits(beginCell(), '1011111011111101111100100001').endCell())
    .endCell()

  it('decodes the whitepaper example', () => {
    const r = decodeDictionary(root.toBoc().toString('base64'), 'uint16', 'uint16', 'direct')
    expect(asObject(r.entries)).toEqual({ 13: '169', 17: '289', 239: '57121' })
    expect(r.rootHash).toBe(root.hash().toString('hex'))
  })

  it('builds the whitepaper example bit-exactly', () => {
    const b = buildDictionary('{"13": 169, "17": 289, "239": "57121"}', 'uint16', 'uint16')
    expect(b.direct!.equals(root)).toBe(true)
    // HashmapE form is a 1 bit + ref; auto-detect picks it
    const r = decodeDictionary(b.hashmapE.toBoc().toString('hex'), 'uint16', 'uint16', 'auto')
    expect(r.layout).toBe('hashmapE')
    expect(r.entries).toHaveLength(3)
  })

  it('handles multi-field values, address keys and array input', () => {
    const json = JSON.stringify([
      ['UQARdqETVZjzwzP-t1YekVJ7sdRXUuMPZ7ERBAhtjhEI29IK', { amount: '1247000000000', start_from: 0, expired_at: 1735689600 }],
      { key: '0:a32d52ced80a23fe4fe90ba94593ef686de03f9fbdaa069e642826a95234b982', value: { amount: 5, start_from: 1, expired_at: 2 } }
    ])
    const spec = 'amount:coins, start_from:uint48, expired_at:uint48'
    const b = buildDictionary(json, 'address', spec)
    const r = decodeDictionary(b.direct!.toBoc().toString('base64'), 'address', spec, 'direct')
    // raw forms: toncenter address_book maps UQARdqET… to 0:1176a1…
    expect(Object.fromEntries(r.entries.map(e => [Address.parse(e.key).toRawString(), e.value]))).toEqual({
      '0:1176a1135598f3c333feb7561e91527bb1d45752e30f67b11104086d8e1108db': { amount: '1247000000000', start_from: '0', expired_at: '1735689600' },
      '0:a32d52ced80a23fe4fe90ba94593ef686de03f9fbdaa069e642826a95234b982': { amount: '5', start_from: '1', expired_at: '2' }
    })
  })

  it('empty dict: HashmapE is a single 0 bit, no direct root', () => {
    const b = buildDictionary('{}', 'uint32', 'ref')
    expect(b.direct).toBeNull()
    expect(b.hashmapE.bits.length).toBe(1)
    expect(decodeDictionary(b.hashmapE.toBoc().toString('base64'), 'uint32', 'ref', 'auto').entries).toEqual([])
  })

  it('reports clear errors', () => {
    expect(() => buildDictionary('{"1": 1, "0x1": 2}', 'uint8', 'uint8')).toThrow(/Duplicate key/)
    expect(() => buildDictionary('{"256": 1}', 'uint8', 'uint8')).toThrow(/does not fit/)
    expect(() => buildDictionary('{"1": {"a": 1}}', 'uint8', 'a:uint8, b:uint8')).toThrow(/"b" is missing/)
    expect(() => buildDictionary('{"1": 1}', 'uint8', 'float')).toThrow(/Unknown value type/)
    expect(() => buildDictionary('{"1": 1}', 'map', 'uint8')).toThrow(/Unknown key type/)
    expect(() => decodeDictionary('not a boc!', 'uint8', 'uint8', 'auto')).toThrow(/base64/)
  })

  it('stores long content as snake cells', () => {
    const text = 'x'.repeat(300)
    const b = buildDictionary(JSON.stringify({ description: text }), 'sha256', 'content')
    const r = decodeDictionary(b.tep64.toBoc().toString('base64'), 'sha256', 'content', 'auto')
    expect(r.entries[0]).toEqual({ key: 'description', value: text })
  })
})
