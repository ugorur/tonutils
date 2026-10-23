import { Cell, serializeTuple, type TupleItem } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { ELECTIONS_TONAPI, ELECTIONS_V2, ELECTIONS_V3, JETTON_DATA_TONAPI, JETTON_DATA_V2, JETTON_DATA_V3 } from './examples'
import { argsToItems, detectFormat, parseStack, readable, toBoc, toTonapi, toTonapiArgs, toToncenterV2, toToncenterV3 } from './logic'

const byHash = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (_, x) =>
  typeof x === 'string' && /^(te6cc|b5ee9c72)/.test(x) ? Cell.fromBoc(Buffer.from(x, x.startsWith('b5') ? 'hex' : 'base64'))[0]!.hash().toString('hex') : x)
const same = (a: Parameters<typeof toBoc>[0], b: Parameters<typeof toBoc>[0]) => expect(toBoc(a)).toBe(toBoc(b))

describe('real get-method results in three API formats', () => {
  const v2 = parseStack(JSON.stringify({ ok: true, result: { stack: JETTON_DATA_V2 } }))
  const v3 = parseStack(JSON.stringify({ stack: JETTON_DATA_V3, exit_code: 0 }))
  const ta = parseStack(JSON.stringify(JETTON_DATA_TONAPI))

  it('detects each format, including whole API responses', () => {
    expect([v2.format, v3.format, ta.format]).toEqual(['toncenter-v2', 'toncenter-v3', 'tonapi'])
  })

  it('reads the same stack from all of them', () => {
    same(v2.items, v3.items)
    same(v3.items, ta.items)
    expect(v3.items[1]).toEqual({ type: 'int', value: -1n }) // "-0x1": mintable flag
  })

  it('writes toncenter v2/v3 and tonapi formats the way the APIs return them', () => {
    // multi-cell BOCs may list cells in another (equally valid) order, so BOC strings compare by cell hash
    expect(byHash(toToncenterV3(ta.items))).toEqual(byHash(JETTON_DATA_V3))
    expect(byHash(toTonapi(v2.items))).toEqual(byHash(JETTON_DATA_TONAPI))
    expect(byHash(toToncenterV2(v3.items))).toEqual(byHash(JETTON_DATA_V2))
    // single-cell BOCs are byte-identical
    expect(toToncenterV3(ta.items)[2]).toEqual(JETTON_DATA_V3[2])
    expect(toTonapi(v2.items)[4]).toEqual(JETTON_DATA_TONAPI[4])
  })

  it('shows total supply as a number and the admin cell as an address', () => {
    // toncenter /api/v3/jetton/masters: total_supply 6680832834409497, admin 0:8BC991CF…
    const r = readable(v3.items)
    expect(r[0]!.value).toBe('6680832834409497')
    expect(r[2]!.type).toBe('cell (address)')
    expect(r[2]!.extra).toBe('0:8bc991cfe177bc7e9721433efa3befd199485a55cffd040a06c89af026b71bcf')
  })

  it('rebuilds the Lisp list that toncenter flattens ("list") the way tonapi shows it', () => {
    const a = parseStack(JSON.stringify(ELECTIONS_V2))
    const b = parseStack(JSON.stringify(ELECTIONS_V3))
    const c = parseStack(JSON.stringify(ELECTIONS_TONAPI))
    same(a.items, c.items)
    same(b.items, c.items)
    expect(toTonapi(b.items)).toEqual(ELECTIONS_TONAPI)
    expect(toTonapi(a.items)[0].tuple[0]).toEqual({ type: 'num', num: '0x6ad94f08' }) // 1792626440 in toncenter v2
  })

  it('detects @ton/core JSON even when it starts with a cell (tonapi uses the same {type, cell} shape)', () => {
    const r = parseStack(JSON.stringify([{ type: 'cell', cell: JETTON_DATA_V3[2]!.value }, { type: 'int', value: '-1' }]))
    expect(r.format).toBe('core')
    same(r.items, [v3.items[2]!, v3.items[1]!])
  })

  it('treats an empty toncenter list as null (wallet v4 get_plugin_list: [] in toncenter, null in tonapi)', () => {
    expect(parseStack('[["list", {"@type": "tvm.list", "elements": []}]]').items).toEqual([{ type: 'null' }])
    expect(parseStack('{"stack": [{"type": "list", "value": []}]}').items).toEqual([{ type: 'null' }])
    expect(parseStack('[{"type": "null"}]').items).toEqual([{ type: 'null' }])
  })
})

describe('VmStack BOC (@ton/core tuple.spec golden vectors)', () => {
  it('serializes numbers', () => {
    const items = ['-1', '-1', '49800000000', '100000000', '100000000', '2500', '100000000'].map(v => ({ type: 'int' as const, value: BigInt(v) }))
    expect(serializeTuple(items).toBoc({ idx: false, crc32: false }).toString('base64')).toBe('te6ccgEBCAEAWQABGAAABwEAAAAABfXhAAEBEgEAAAAAAAAJxAIBEgEAAAAABfXhAAMBEgEAAAAABfXhAAQBEgEAAAALmE+yAAUBEgH//////////wYBEgH//////////wcAAA==')
    // and our converter reads it back from the BOC
    const back = parseStack('te6ccgEBCAEAWQABGAAABwEAAAAABfXhAAEBEgEAAAAAAAAJxAIBEgEAAAAABfXhAAMBEgEAAAAABfXhAAQBEgEAAAALmE+yAAUBEgH//////////wYBEgH//////////wcAAA==')
    expect(back.format).toBe('boc')
    expect(back.items).toEqual(items)
  })

  it('round-trips the nested tuple vector', () => {
    const golden = 'te6ccgEBEAEAjgADDAAABwcABAEIDQESAf//////////AgESAQAAAAAAAAADAwESAQAAAAAAAAACBAESAQAAAAAAAAABBQECAAYBEgEAAAAAAAAAAQcAAAIACQwCAAoLABIBAAAAAAAAAHsAEgEAAAAAAAHimQECAw8BBgcAAQ4BCQQAB0AgDwAd4GEghEZ4iF1r9AWzyJs4'
    const { items } = parseStack(golden)
    expect(serializeTuple(items).toBoc({ idx: false, crc32: false }).toString('base64')).toBe(golden)
    // survives every JSON format
    for (const json of [toToncenterV3(items), toTonapi(items)]) same(parseStack(JSON.stringify(json)).items, items)
  })

  it('serializes an address slice like the golden vector', () => {
    const items = argsToItems([{ type: 'address', value: 'kf_JuhGlmBjeEKBjLssAuQxeUc6N-CH6bKaN5fjrfhqFpqVQ' }])
    expect(serializeTuple(items).toBoc({ idx: false, crc32: false }).toString('base64url')).toBe('te6ccgEBAwEAMgACDwAAAQQAELAgAQIAAABDn_k3QjSzAxvCFAxl2WAXIYvKOdG_BD9NlNG8vx1vw1C00A')
  })
})

describe('get-method arguments', () => {
  // Sent to HMSTR master get_wallet_address on 2026-10-22; all three APIs answered with jetton wallet 0:120080db…
  const OWNER = 'UQARdqETVZjzwzP-t1YekVJ7sdRXUuMPZ7ERBAhtjhEI29IK'
  const SLICE_B64 = 'te6cckEBAQEAJAAAQ4ACLtQiarMeeGZ/1urD0ipPdjqK6lxh7PYiIIENscIhG3D8du/h'
  const items = argsToItems([{ type: 'address', value: OWNER }])

  it('produces the exact request bodies that worked', () => {
    expect(toToncenterV2(items, true)).toEqual([['tvm.Slice', SLICE_B64]])
    expect(toToncenterV3(items)).toEqual([{ type: 'slice', value: SLICE_B64 }])
    expect(toTonapiArgs(items)).toEqual({ args: [{ type: 'slice', value: '0:1176a1135598f3c333feb7561e91527bb1d45752e30f67b11104086d8e1108db' }] })
  })

  it('only emits argument types each API accepts', () => {
    // Probed 2026-10-23 on HMSTR master get_wallet_address: toncenter v3 POST answers
    // "unsupported stack parameter type: list|null|tuple|nan|builder"; v2 answers "Unsupported stack entry type: tvm.Builder"
    // but accepts ["list", {elements: []}] for null (the method then fails with exit code 7, a TVM type check).
    expect(toToncenterV3(items, true)).toEqual([{ type: 'slice', value: SLICE_B64 }])
    for (const i of [{ type: 'null' }, { type: 'nan' }, { type: 'tuple', items: [] }, { type: 'builder', cell: Cell.EMPTY }] satisfies TupleItem[]) {
      expect(() => toToncenterV3([i], true)).toThrow(/only takes int, cell and slice/)
    }
    expect(() => toToncenterV2([{ type: 'builder', cell: Cell.EMPTY }], true)).toThrow(/builder/)
    expect(toToncenterV2([{ type: 'null' }], true)).toEqual([['list', { '@type': 'tvm.list', 'elements': [] }]])
    // tonapi: {type: 'null'} → "value (field required)", value '' → "expected 'Null' for type 'null'"; these run
    expect(toTonapiArgs([{ type: 'null' }, { type: 'nan' }]).args).toEqual([{ type: 'null', value: 'Null' }, { type: 'nan', value: 'NaN' }])
  })

  it('reads tonapi args back', () => {
    const body = { args: [{ type: 'slice_boc_hex', value: 'b5ee9c7241010101002400004380022ed4226ab31e78667fd6eac3d22a4f763a8aea5c61ecf62220810db1c2211b70fc76efe1' }, { type: 'tinyint', value: '-5' }, { type: 'int257', value: '0xff' }] }
    const r = parseStack(JSON.stringify(body))
    expect(r.format).toBe('tonapi-args')
    same(r.items.slice(0, 1), items)
    expect(r.items.slice(1)).toEqual([{ type: 'int', value: -5n }, { type: 'int', value: 255n }])
  })

  it('picks tinyint/int257 like tonapi expects', () => {
    const big = (1n << 200n)
    expect(toTonapiArgs([{ type: 'int', value: -5n }, { type: 'int', value: big }]).args).toEqual([
      { type: 'tinyint', value: '-5' },
      { type: 'int257', value: `0x${big.toString(16)}` }
    ])
    expect(() => toTonapiArgs([{ type: 'int', value: -big }])).toThrow(/64 bits/)
  })

  it('rejects bad input clearly', () => {
    expect(() => argsToItems([{ type: 'int', value: '12abc' }])).toThrow(/Argument 1/)
    expect(() => argsToItems([{ type: 'address', value: 'nope' }])).toThrow(/not a TON address/)
    expect(() => detectFormat('{"foo": 1}')).toThrow(/Paste a stack/)
    expect(() => toToncenterV2([{ type: 'tuple', items: [] }], true)).toThrow(/tuple/)
  })
})
