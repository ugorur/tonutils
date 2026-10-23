// Expected values come from toncenter /api/v3 `message_content.decoded` for the same mainnet messages
// (see vectors.ts for hashes), not from our decoder.
import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { analyzeInput, decodePayload, flatten, txMessages, type V3Transaction } from './logic'
import * as V from './vectors'

const fr = (raw: string, bounceable = true) => Address.parseRaw(raw).toString({ bounceable })
const flat = (boc: string) => flatten(decodePayload(boc))

describe('decodePayload: real mainnet bodies', () => {
  it('jetton transfer (shared decoder path)', () => {
    const f = flat(V.JETTON_TRANSFER)
    expect(f.name).toBe('jetton_transfer')
    expect(f.query_id).toBe('10133825672481603584')
    expect(f.amount).toBe('100000000000')
    expect(f.destination).toBe(fr('0:DEBC6DBFBC4619DA0B5ADDE36C85CBC4F1E6C7CAC58FAC7A488F2EC724058C26'))
    expect(f.forward_ton_amount).toBe('70000000')
  })

  it('W5 external signed request with one action', () => {
    const f = flat(V.W5_EXTERNAL)
    expect(f.name).toBe('w5_external_signed')
    expect(f.wallet_id).toBe('2147483409')
    expect(f.valid_until).toMatch(/^1792698674 /)
    expect(f.seqno).toBe('19')
    expect(f.signature).toBe('F82FE5928EE6ABA81FCF58D1DE3D2032CB30DC8D69DB16B1A9154589E979F2B46F4897A01D0E99A0D03CC513FC56D27256BFEF725C3AC9787AC25BEF7311A401'.toLowerCase())
    expect(f['action_1.name']).toBe('action_send_msg')
    expect(f['action_1.mode']).toMatch(/^3 = /)
    expect(f['action_1.to']).toBe(fr('0:47EE508A366041C24B854F13CB0D6E2D25B860D4BA29056D32C14CF41C7C028B'))
    expect(f['action_1.value']).toBe('20000000')
    expect(f['action_1.bounce']).toBe('true')
    expect(f['action_1.body.name']).toBe('dns_change_record')
    expect(f['action_1.body.query_id']).toBe('1792698375')
    expect(f['action_1.body.key']).toBe('e8d44050873dba865aa7c170ab4cce64d90839a34dcfd6cf71d14e0205443b1b')
    expect(f.action_2).toBeUndefined()
  })

  it('W5 internal signed request: two actions in send order', () => {
    const f = flat(V.W5_INTERNAL)
    expect(f.name).toBe('w5_internal_signed')
    expect(f.seqno).toBe('24')
    expect(f.valid_until).toMatch(/^1792698732 /)
    // toncenter lists the out_list root (last action) first; send order is prev -> root.
    expect(f['action_1.value']).toBe('2000000')
    expect(f['action_1.body.amount']).toBe('998494381')
    expect(f['action_1.body.destination']).toBe(fr('0:22E951226D6CE9C5202CCC1C6EE2A49F481DD7A54E22501428B8D861545229D1'))
    expect(f['action_2.value']).toBe('100000000')
    expect(f['action_2.body.amount']).toBe('5619')
    expect(f['action_2.body.forward_ton_amount']).toBe('1')
  })

  it('W5 extension request', () => {
    const f = flat(V.W5_EXTENSION)
    expect(f.name).toBe('w5_extension_action')
    expect(f.query_id).toBe('0')
    expect(f['action_1.value']).toBe('2352986186')
    expect(f['action_1.bounce']).toBe('false')
    expect(f['action_1.to']).toBe(fr('0:341ED5FC13D653CCC39A81A432329B76A5DF31D9FEA273DAA416B77E48E04FEE', false))
    expect(f['action_1.body.text']).toBe('UDCEA0B7A6')
  })

  it('highload v3 internal transfer with a StateInit-carrying message', () => {
    const f = flat(V.HIGHLOAD_INTERNAL)
    expect(f.name).toBe('highload_v3_internal_transfer')
    expect(f['action_1.value']).toBe('324295')
    expect(f['action_1.to']).toBe(fr('0:0D5AB8D2665C8A86B3371ECE305289476FDE489AB27BE4BE86270B95762A4FD8', false))
    expect(f['action_1.state_init.name']).toBe('state_init')
    expect(f['action_1.state_init.matches_destination']).toBe('true')
    expect(Cell.fromBase64(f['action_1.state_init.code']!).equals(Cell.fromBase64('te6ccgEBAQEAGgAAMP8AIJgh10mDCLnyQN+Ahfgz0O0eIO1T2Q=='))).toBe(true)
  })

  it('highload v3 external body (no op code, recognised by layout)', () => {
    const f = flat(V.HIGHLOAD_EXTERNAL)
    expect(f.name).toBe('highload_v3_external')
    expect(f.subwallet_id).toBe('1')
    expect(f.query_id).toBe(`${3638 * 1024 + 647} (shift 3638, bit 647)`)
    expect(f.created_at).toMatch(/^1792698195 /)
    expect(f.timeout).toBe('21600')
    expect(f['message.value']).toBe('110000000')
    expect(f['message.to']).toBe(fr('0:70AB0B3D638CCC31BB23767BD0D60D50D3AB49401408279A0467B82078982F2D', false))
  })

  it('wallet v4 external body', () => {
    const f = flat(V.WALLET_V4_EXTERNAL)
    expect(f.name).toBe('wallet_v4_external')
    expect(f.subwallet_id).toBe('698983191')
    expect(f.seqno).toBe('54')
    expect(f.valid_until).toMatch(/^1792698966 /)
    expect(f['action_1.value']).toBe('7402745826')
    expect(f['action_1.body.name']).toBe('pton_ton_transfer')
  })

  it('bounced body keeps the original op and query id', () => {
    const f = flat(V.BOUNCED)
    expect(f.name).toBe('bounce')
    expect(f.original_op).toBe('0xaf750d34')
    expect(f.original_query_id).toBe(BigInt('0x8dd95e0900024661').toString())
  })

  it('known op without a local layout keeps its BOC (STON.fi v2 swap)', () => {
    const f = decodePayload(V.STONFI_SWAP_V2)
    expect(f.name).toBe('stonfi_swap_v2')
    expect(f.fields.boc).toBe(Cell.fromBase64(V.STONFI_SWAP_V2).toBoc().toString('base64'))
  })

  it('encrypted comment is recognised', () => {
    expect(decodePayload(V.ENCRYPTED_COMMENT).name).toBe('encrypted_comment')
  })

  it('unknown bodies keep their BOC for copying', () => {
    const f = decodePayload('te6cckEBAQEACgAAEDWi/3w//LMw7HcYZA==') // ext body yDSYeqL2… (unknown to toncenter too)
    expect(f.name).toBe('unknown')
    expect(typeof f.fields.boc).toBe('string')
  })
})

describe('analyzeInput', () => {
  it('detects transaction hashes (hex and base64)', () => {
    expect(analyzeInput(V.JETTON_TX_HASH)).toEqual({ kind: 'hash', hash: V.JETTON_TX_HASH })
    expect(analyzeInput('EbwxJsK4knXJzeHXTGCZzMUEIYamu6L8VCpBTTthS18=')).toEqual({ kind: 'hash', hash: V.JETTON_TX_HASH })
  })

  it('decodes a full external message and matches its toncenter hash', () => {
    const r = analyzeInput(V.EXT_MESSAGE)
    expect(r.kind).toBe('message')
    if (r.kind !== 'message') return
    expect(r.message.type).toBe('external-in')
    expect(r.message.hash).toBe(Buffer.from(V.EXT_MESSAGE_HASH_B64, 'base64').toString('hex'))
    expect((r.message.fields.body as { name: string }).name).toBe('w5_external_signed')
  })

  it('keeps a known body as a body', () => {
    expect(analyzeInput(V.JETTON_TRANSFER).kind).toBe('body')
  })

  it('throws a friendly error on garbage', () => {
    expect(() => analyzeInput('hello world')).toThrow(/Not a valid BOC/)
  })
})

describe('txMessages', () => {
  it('maps a toncenter v3 transaction', () => {
    const tx: V3Transaction = {
      hash: 'EbwxJsK4knXJzeHXTGCZzMUEIYamu6L8VCpBTTthS18=',
      account: '0:205EDC9096A545D95DC5E262A56EF6335228E51A352625B3D6916BA214D769CD',
      now: 1792698375,
      lt: '111703882000049',
      in_msg: { hash: 'x', source: '0:22BF722EC5803A64612E9CE819493B8C0736E98F045B5B0D3DF96B04FA2A8A28', destination: '0:205EDC9096A545D95DC5E262A56EF6335228E51A352625B3D6916BA214D769CD', value: '995026816', bounced: false, message_content: { body: V.JETTON_TRANSFER } },
      out_msgs: [{ hash: 'y', source: null, destination: null, value: null, bounced: null, message_content: { body: 'te6cckEBAQEAAgAAAEysuc0=' } }]
    }
    const m = txMessages(tx)
    expect(m).toHaveLength(2)
    expect(m[0]!.direction).toBe('in')
    expect(m[0]!.value).toBe(995026816n)
    expect(m[0]!.body.name).toBe('jetton_transfer')
    expect(m[1]!.body.name).toBe('empty')
  })
})
