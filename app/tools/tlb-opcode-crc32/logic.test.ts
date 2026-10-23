import { describe, expect, it } from 'vitest'
import { constants, constructorTag, crc32, normalize, schemaTags } from './logic'

describe('crc32', () => {
  it('matches the CRC-32/ISO-HDLC check value', () => {
    // standard check value from the CRC catalogue (reveng): crc32("123456789") = 0xcbf43926
    expect(crc32('123456789')).toBe(0xcbf43926)
    expect(crc32('')).toBe(0)
  })
})

// TL-B lines as published in TEP-74 / TEP-62 / TEP-89; expected op codes are the ones those TEPs define.
const TEP74_TRANSFER = 'transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;'

describe('constructorTag', () => {
  it('reproduces the TEP-74 transfer derivation', () => {
    // TEP-74: crc32('transfer query_id:uint64 amount:VarUInteger 16 destination:MsgAddress response_destination:MsgAddress
    // custom_payload:Maybe ^Cell forward_ton_amount:VarUInteger 16 forward_payload:Either Cell ^Cell = InternalMsgBody')
    // = 0x8f8a7ea5 & 0x7fffffff = 0xf8a7ea5
    const t = constructorTag(TEP74_TRANSFER)
    expect(t.normalized).toBe('transfer query_id:uint64 amount:VarUInteger 16 destination:MsgAddress response_destination:MsgAddress custom_payload:Maybe ^Cell forward_ton_amount:VarUInteger 16 forward_payload:Either Cell ^Cell = InternalMsgBody')
    expect(t.crc).toBe(0x8f8a7ea5)
    expect(t.masked).toBe(0x0f8a7ea5)
    expect(t.explicitValue).toBe(0x0f8a7ea5)
    expect(t.explicitMatches).toEqual(['masked'])
    expect(t.known[0]).toMatchObject({ variant: 'explicit', info: { name: 'jetton_transfer' } })
  })

  it.each([
    // [TL-B from the TEP, op the TEP defines, which variant equals it]
    ['transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody;', 0x7362d09c, 'masked'],
    ['excesses#d53276db query_id:uint64 = InternalMsgBody;', 0xd53276db, 'topBit'],
    ['burn#595f07bc query_id:uint64 amount:(VarUInteger 16) response_destination:MsgAddress custom_payload:(Maybe ^Cell) = InternalMsgBody;', 0x595f07bc, 'crc'],
    ['internal_transfer#178d4519 query_id:uint64 amount:(VarUInteger 16) from:MsgAddress response_address:MsgAddress forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;', 0x178d4519, 'masked'],
    ['burn_notification#7bdd97de query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress response_destination:MsgAddress = InternalMsgBody;', 0x7bdd97de, 'crc'],
    // TEP-62
    ['transfer#5fcc3d14 query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;', 0x5fcc3d14, 'crc'],
    ['ownership_assigned#05138d91 query_id:uint64 prev_owner:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody;', 0x05138d91, 'masked'],
    ['get_static_data#2fcb26a2 query_id:uint64 = InternalMsgBody;', 0x2fcb26a2, 'crc'],
    ['report_static_data#8b771735 query_id:uint64 index:uint256 collection:MsgAddress = InternalMsgBody;', 0x8b771735, 'topBit'],
    // TEP-89
    ['provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;', 0x2c76b973, 'crc'],
    ['take_wallet_address#d1735400 query_id:uint64 wallet_address:MsgAddress owner_address:(Maybe ^MsgAddress) = InternalMsgBody;', 0xd1735400, 'crc']
  ] as const)('%s', (line, op, variant) => {
    const t = constructorTag(line)
    expect(t[variant]).toBe(op)
    expect(t.explicitMatches).toContain(variant)
  })

  it('agrees with tlb-codegen on an untagged constructor', () => {
    // @ton-community/tlb-codegen assigns `foo x:uint8 = A;` the implicit tag 0xd0f9e686
    expect(constructorTag('foo x:uint8 = A;').crc).toBe(0xd0f9e686)
  })

  it('normalizes whitespace, comments, braces and constraints', () => {
    expect(normalize('  transfer   query_id : uint64\n  amount:( VarUInteger  16 ) // comment\n = InternalMsgBody ; ').normalized)
      .toBe('transfer query_id:uint64 amount:VarUInteger 16 = InternalMsgBody')
    expect(normalize('hm_edge#_ {n:#} {X:Type} {l:#} {m:#} label:(HmLabel ~l n) {n = (~m) + l} node:(HashmapNode m X) = Hashmap n X;'))
      .toEqual({ name: 'hm_edge', explicit: '#_', normalized: 'hm_edge n:# X:Type l:# m:# label:HmLabel ~l n n = ~m + l node:HashmapNode m X = Hashmap n X' })
    expect(normalize('unit$_ = Unit;')).toEqual({ name: 'unit', explicit: '$_', normalized: 'unit = Unit' })
  })

  it('rejects bad input', () => {
    expect(() => constructorTag('transfer query_id:uint64')).toThrow(/= TypeName/)
    expect(() => constructorTag('_ x:uint8 = A;')).toThrow(/no tag/)
    expect(() => constructorTag('= A')).toThrow(/constructor name/)
  })
})

describe('schemaTags', () => {
  it('handles a whole schema', () => {
    const r = schemaTags('// jettons\nexcesses#d53276db query_id:uint64 = InternalMsgBody;\n_ x:# = Foo;\nfoo x:uint8 = A;')
    expect(r).toHaveLength(3)
    expect('tag' in r[0]! && r[0].tag.topBit).toBe(0xd53276db)
    expect('error' in r[1]!).toBe(true)
  })
})

describe('constants', () => {
  it('formats for Tolk, FunC and Tact', () => {
    expect(constants('transfer_notification', 0x7362d09c)).toEqual({
      tolk: 'const OP_TRANSFER_NOTIFICATION = 0x7362d09c;',
      func: 'const int op::transfer_notification = 0x7362d09c;',
      tact: 'const OpTransferNotification: Int = 0x7362d09c;'
    })
  })
})
