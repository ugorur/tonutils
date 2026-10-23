import { createHash } from 'node:crypto'
import * as parser from '@ton-community/tlb-parser'
import * as rt from '@ton-community/tlb-runtime'
import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { TLB_PRESETS } from '~/lib/tlb/presets'
import { compileSchema, decodeBoc, encodeJson, parseBits, summarize } from './logic'

const compile = (schema: string) => compileSchema(rt, parser as never, schema)
const preset = (id: string) => TLB_PRESETS.find(p => p.id === id)!
const presetSchema = (id: string) => compile(preset(id).schema ?? rt.blockSchema)

describe('tlb-runtime README vector', () => {
  const s = compile('_ x:# = Foo;')
  it('decodes', () => {
    expect(decodeBoc(s, 'te6cckEBAQEABgAACAAAACoFpvBE', 'auto').value).toEqual({ kind: 'Foo', x: 42 })
  })
  it('encodes', () => {
    expect(encodeJson(s, '{"kind":"Foo","x":73}').equals(Cell.fromBase64('te6cckEBAQEABgAACAAAAEmTxmY2'))).toBe(true)
  })
})

// Expected values come from toncenter /api/v3/decode and /api/v3/messages for the same BOCs (fetched 2026-10-22).
describe('preset examples against toncenter', () => {
  it('TEP-74 jetton transfer', () => {
    const d = decodeBoc(presetSchema('tep74'), preset('tep74').example!.boc, 'auto')
    expect(d.type).toBe('InternalMsgBody')
    expect(d.value).toEqual({
      kind: 'InternalMsgBody_transfer',
      query_id: '3',
      amount: '1114695',
      destination: 'EQAgIpD6-chQecNWttJLY0nQqVF5NmjAnP2VpNVjg01u6Yzn', // 0:202290FA…6EE9
      response_destination: 'EQAkCm29IOq33ViUNi2WQI-D0_16J63JdLLkUdzbGfJbvIWM', // 0:240A6DBD…5BBC
      custom_payload: { kind: 'Maybe_nothing' },
      forward_ton_amount: '1',
      forward_payload: { kind: 'Either_left', value: 'te6cckEBAQEAAgAAAEysuc0=' }
    })
    expect(d.leftover).toEqual({ bits: 0, refs: 0 })
  })

  it('TEP-62 NFT transfer', () => {
    const d = decodeBoc(presetSchema('tep62'), preset('tep62').example!.boc, 'InternalMsgBody')
    expect(d.value).toMatchObject({
      kind: 'InternalMsgBody_transfer',
      query_id: '14',
      new_owner: 'EQCKui-GDht90EYZcuLJgmzuZ-_jr_TJGL_1rHV58isypIGE', // 0:8ABA2F86…32A4
      response_destination: 'EQDCNwjGlMioMvMqB8uKuBFyN202Zny9V4i_SOesSyCfyYRe', // 0:C23708C6…9FC9
      forward_amount: '0'
    })
  })

  it('W5 external signed request', () => {
    const d = decodeBoc(presetSchema('w5'), preset('w5').example!.boc, 'auto')
    const signed = (d.value as { signed: Record<string, unknown> }).signed
    expect(signed).toMatchObject({ wallet_id: 2147483409, valid_until: 1792688138, msg_seqno: 7 })
    expect(signed.signature).toBe('C056E8802DE21AF8D6D68818197A9BF47A8CF4CDF8C1AB7CA5C17C5DE7CEC34E4384ACEF3ACCD83BBF08398575D8815F77A5E9C83E76C9BE2A7BF0F637D8C20F')
    expect(JSON.stringify(signed.inner)).toContain('"kind":"OutAction_action_send_msg","mode":3')
  })

  it('block.tlb StateInit: auto-detected, hash is the deployed account address', () => {
    const d = decodeBoc(presetSchema('block'), preset('block').example!.boc, 'auto')
    expect(d.type).toBe('StateInit')
    expect(d.cellHash.toUpperCase()).toBe('B41BEF5AFF9529E8A47EBDBA03492BAEBED13FF18C9EC6415711252444BECE42')
    expect(d.value).toMatchObject({ kind: 'StateInit', special: { kind: 'Maybe_nothing' }, code: { kind: 'Maybe_just' } })
  })

  it('TEP-64 on-chain content: keys are sha256 of the attribute names', () => {
    const d = decodeBoc(presetSchema('tep64'), preset('tep64').example!.boc, 'FullContent')
    const sha = (s: string) => BigInt('0x' + createHash('sha256').update(s).digest('hex')).toString()
    const data = (d.value as { kind: string, data: Record<string, unknown> })
    expect(data.kind).toBe('FullContent_onchain')
    expect(Object.keys(data.data).sort()).toEqual([sha('uri'), sha('decimals')].sort())
    const uri = Cell.fromBase64((data.data[sha('uri')] as { data: string }).data)
    expect(uri.toString()).toContain(Buffer.from('https://tether.to/usdt-ton.json').toString('hex').toUpperCase())
  })
})

describe('encodeJson', () => {
  it.each(TLB_PRESETS.map(p => p.id))('round-trips the %s example bit-exactly', (id) => {
    const s = presetSchema(id)
    const boc = preset(id).example!.boc
    const d = decodeBoc(s, boc, preset(id).example!.type)
    expect(encodeJson(s, JSON.stringify(d.value)).hash().toString('hex')).toBe(d.cellHash)
  })

  it('reports useful errors', () => {
    const s = presetSchema('tep74')
    expect(() => encodeJson(s, '{')).toThrow(/Invalid JSON/)
    expect(() => encodeJson(s, '{"x":1}')).toThrow(/"kind"/)
    expect(() => encodeJson(s, '{"kind":"Nope"}')).toThrow(/not in the schema/)
    expect(() => encodeJson(s, '{"kind":"InternalMsgBody_excesses","query_id":"abc"}')).toThrow(/query_id: expected an integer/)
  })

  it('parses bits in BitString.toString() form', () => {
    expect(parseBits('B_', 3, 'x').toString()).toBe('B_') // 101 + completion bit
    expect(parseBits('FF', 8, 'x').toString()).toBe('FF')
    expect(() => parseBits('FF', 7, 'x')).toThrow(/7 bits/)
  })
})

describe('compileSchema', () => {
  it('reports syntax errors with a position', () => {
    expect(() => compile('foo x:uint8 = ;')).toThrow(/Line 1/)
    expect(() => compile('  ')).toThrow(/Enter/)
  })

  it('summarizes types and tags', () => {
    const t = summarize(presetSchema('tep74')).find(x => x.name === 'InternalMsgBody')!
    expect(t.constructors.map(c => `${c.name}${c.tag}`)).toContain('transfer#0f8a7ea5')
    expect(summarize(compile('a$10 = T; b$0 = T;'))[0]!.constructors.map(c => c.tag)).toEqual(['$10', '$0'])
  })

  it('rejects bad BOCs', () => {
    expect(() => decodeBoc(compile('_ x:# = Foo;'), 'hello', 'auto')).toThrow(/Not a valid BOC/)
  })
})
