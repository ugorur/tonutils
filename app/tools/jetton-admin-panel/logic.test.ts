import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildOnchainContent, changeAdminBody, changeMetadataBody, flavorByCodeHash, mintBody, readContent } from '~/lib/token-launch/jetton-minter'
import { actionMessage, availableActions, detect, parseMaster, parseNextAdmin, type ToncenterJettonMaster } from './logic'

// Every body below is a real mainnet message read from toncenter v3 /messages?opcode=… (message hash in the comment).
const V21 = {
  // 7O1mwPXykfSpc4BLIN9VxZn2r9K5n9CQTzZCFbujCgo= -> EQBteUO5pu…, drop_admin
  drop: 'te6cckEBAQEADgAAGHQx8iEAAAAAAAAAAJm1rE4=',
  // BMsePvD3E7b8Pz+ySYkXxb1774jqvuo2H084qBctAVg= -> 0:8D1E29…, change_admin to 0:63bb8c… (query 13958268547343053410)
  changeAdmin: 'te6cckEBAQEAMAAAW2UB81TBtbtKK+PyYoAMd3GFGMVPBcjN0+99lWyiTmiy3SnzC/TDv9grRbOPVtACg4dm',
  // b2dbpG9L1kd/xhgsYEJke3JEWfl3ltZ7Dvlw26XIaX4= <- 0:63bb8c… claims admin of the same minter
  claim: 'te6cckEBAQEADgAAGPuI4RkAAAAAAAAAAAi3ulc=',
  // BtdYcvey8aP/KRqN9U+mr2HPnwDRd97K+uU4B0wfmzY=: mint 10^16 units to 0:ae4773…, ton_amount 0.05, total 0.1
  mint: 'te6cckEBAgEAcAABY2QrfQcAAAAAAAAAAIAVyO58YEp3DJGQp5keozRh1qAb42kteTyI9PU8Wn0nc6gF9eEBAQBxF41FGQAAAAAAAAAAcjhvJvwQAAIAVyO58YEp3DJGQp5keozRh1qAb42kteTyI9PU8Wn0nc6YehICJ2P+qA==',
  // bkV1iBoMchr0wVE7Q3VpbqQh6SjPmZ81QmDx2t7nQQU=: change_metadata with a full on-chain content cell
  metadata: 'te6cckECEQEAAgMAARjLhikCAAAAAAAAAAABAQMAwAICASADBAFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAUCASAGBwBEAGh0dHBzOi8vaS5pYmIuY28vMHA5UkZtY04vVC1aLnBuZwIBIAgJAgEgDA0BQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwoBQb9u1PlCp4SM4ssGa3ehEoxqH/jEP0OKLc4kYSup/6uLAwsADgBaYXJMdXgACgBaQVJMAUG/Ugje9G9aHU+dzmarMJ9KhRMF8Wb5Hvedkj71jjT5ogkOAUG/XQH6XjwGkBxFBGxrLdzqWvdk/qDu1yoQ1ATyMSzrJH0QAf4AWkFSTFVYIGlzIGEgY29tbXVuaXR5LWRyaXZlbiBkaWdpdGFsIHRva2VuIGluc3BpcmVkIGJ5IGdvbGQsIGFtYml0aW9uLCBhbmQgaW5ub3ZhdGlvbi4gQnVpbHQgb24gVGhlIE9wZW4gTmV0d29yayAoVE9OKSwgWkFSTFVYDwDUIHJlcHJlc2VudHMgYSB2aXNpb24gb2YgYSBtb2Rlcm4gZGlnaXRhbCBmdXR1cmUgcm9vdGVkIGluIHN0cmVuZ3RoLCB0cmFuc3BhcmVuY3ksIGFuZCBnbG9iYWwgY29ubmVjdGl2aXR5LgAEADmKSirC'
}
const LEGACY = {
  // OmiChNTWKhl/76sdu92kc02KcVvJzPP3TketGtLr1rc=: mint#15 of 10^10 units to 0:d9b1dc…, ton_amount 0.02, total 0.04
  mint: 'te6cckEBAgEAbgABYwAAABUAAAAAAAAAAIAbNjuE9QsYCSBAsripMHCpLpEQDKGLlz5u12m6DJXeY6gCYloBAQBtF41FGQAAAAAAAAAAUCVAvkACAGzY7hPULGAkgQLK4qTBwqS6REAyhi5c+btdpugyV3mOmHoSAtymebQ=',
  // 5mMn0rBrkJQ9WKIEXEu5d2bnywPhWRTnBBKZ7JkpS5U=: change_admin#3 to the zero address (minter.ton.org "revoke ownership")
  drop: 'te6cckEBAQEAMAAAWwAAAAMAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABDuEbxV',
  // aKZy8ONzDXnusEZ5IdLILpjhEQPxFCWv0l2MJjW0b+w=: change_content#4, on-chain content, 0.01 GRAM
  content: 'te6cckECEgEAArcAARgAAAAEAAAAAAAAAAABAQMAwAICASADBAFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAUCASAGBwB+AGh0dHBzOi8vc3RvcmFnZS5keW9yLmlvL2pldHRvbnMvaW1hZ2VzLzE3OTI2Nzg5MzEvODYwMjkyMzUucG5nAgEgCAkCASAMDQFBv0VGpv/ht5z92GutPbh0MT3N4vsF5qdKp/NVLZYXx50TCgFBv27U+UKnhIziywZrd6ESjGof+MQ/Q4otziRhK6n/q4sDCwAeAE1BREVJTiBBUk1FTklBAAgAQVJNAUG/Ugje9G9aHU+dzmarMJ9KhRMF8Wb5Hvedkj71jjT5ogkOAUG/XQH6XjwGkBxFBGxrLdzqWvdk/qDu1yoQ1ATyMSzrJH0RAf4AQVJNIFRva2VuIOKAlCBNQURFIElOIEFSTUVOSUEKCkFSTSBpcyBhIGNvbW11bml0eS1kcml2ZW4gZGlnaXRhbCB0b2tlbiBvbiB0aGUgVE9OIGJsb2NrY2hhaW4sIGRlc2lnbmVkIGZvciB0aGUgQVJNIFRhcCBlY29zeXN0DwH8ZW0uIFRoZSBwcm9qZWN0IGZvY3VzZXMgb24gY29tbXVuaXR5IHBhcnRpY2lwYXRpb24sIGRpZ2l0YWwgZ2FtaW5nLCBhbmQgYmxvY2tjaGFpbiB0ZWNobm9sb2d5LgoKVGhpcyBpbmZvcm1hdGlvbiBpcyBwcm92aWRlZCBmEADyb3IgaW5mb3JtYXRpb25hbCBwdXJwb3NlcyBvbmx5IGFuZCBkb2VzIG5vdCBjb25zdGl0dXRlIGZpbmFuY2lhbCBvciBpbnZlc3RtZW50IGFkdmljZS4gTm8gcHJvZml0IG9yIHJldHVybiBpcyBndWFyYW50ZWVkLgAEADl6Vl4O'
}
// bmELMtYInvDzZQDoHkry0+0TueD1rMlO8qDTJD1/Yss=: change_metadata_uri with the URL inline (Jetton 2.0 / stablecoin style)
const URI_BODY = 'te6cckEBAQEAUQAAnsuGKQIAAAAAAAAAAGh0dHBzOi8vZnJlZXJ1cG9ybGFiczEub25saW5lL3J1cG9yMjAvYXNzZXRzL2pldHRvbi9ycHItamV0dG9uLmpzb24gZnJ+'

const cell = (b64: string) => Cell.fromBase64(b64)
const v21 = detect('a/j0jKl9P9nI5VM0Tv568DDDIkWeLuIZegUhYvGWG/s=', null)!
const legacy = detect('mg+Y3W+/Il7vgWXk5kQX7pMffuoABlNDnntdzcBkTNY=', null)!
const MINTER = 'EQABsXLOFJD754hGq4oUsN54Bczm5AklOfhpA5MIFPjbmD1q'

describe('Jetton 2.x bodies match mainnet', () => {
  it('mint', () => {
    const to = Address.parse('0:ae4773e30253b8648c853cc8f519a30eb500df1b496bc9e447a7a9e2d3e93b9d')
    const m = actionMessage(MINTER, v21, { id: 'mint', to, amount: 10000000000000000n, response: to }, false)
    expect(m.payload.equals(cell(V21.mint))).toBe(true)
    expect(m.amount).toBe(100000000n)
  })
  it('drop admin, claim admin', () => {
    expect(actionMessage(MINTER, v21, { id: 'drop-admin' }, false).payload.equals(cell(V21.drop))).toBe(true)
    expect(actionMessage(MINTER, v21, { id: 'claim-admin' }, false).payload.equals(cell(V21.claim))).toBe(true)
  })
  it('change admin (with the real query id)', () => {
    const b = changeAdminBody('v2', Address.parse('0:63bb8c28c62a782e466e9f7becab6512734596e94f985fa61dfec15a2d9c7ab6'), 13958268547343053410n)
    expect(b.equals(cell(V21.changeAdmin))).toBe(true)
  })
  it('change metadata: rebuilding the on-chain content from its fields gives the same body', () => {
    const real = cell(V21.metadata)
    const parsed = readContent(real.refs[0]!)
    if (parsed.kind !== 'onchain') throw new Error('expected on-chain content')
    expect(parsed.meta.symbol).toBe('ZARL')
    expect(parsed.meta.description!.length).toBeGreaterThan(126) // spans two snake cells
    const m = actionMessage(MINTER, v21, { id: 'metadata', content: buildOnchainContent(parsed.meta) }, false)
    expect(m.payload.equals(real)).toBe(true)
  })
  it('change metadata URI (inline snake string)', () => {
    const b = changeMetadataBody({ family: 'v2', metadata: 'uri' }, 'https://freeruporlabs1.online/rupor20/assets/jetton/rpr-jetton.json')
    expect(b.equals(cell(URI_BODY))).toBe(true)
  })
})

describe('classic minter bodies match mainnet', () => {
  it('mint#15', () => {
    const to = Address.parse('0:d9b1dc27a858c049020595c549838549748880650c5cb9f376bb4dd064aef31d')
    const m = actionMessage(MINTER, legacy, { id: 'mint', to, amount: 10000000000n, response: to }, false)
    expect(m.payload.equals(cell(LEGACY.mint))).toBe(true)
    expect(m.amount).toBe(40000000n)
    expect(mintBody({ family: 'legacy', to, amount: 10000000000n, response: to }).equals(m.payload)).toBe(true)
  })
  it('renounce = change_admin#3 to the zero address', () => {
    expect(actionMessage(MINTER, legacy, { id: 'drop-admin' }, false).payload.equals(cell(LEGACY.drop))).toBe(true)
  })
  it('change_content#4', () => {
    const real = cell(LEGACY.content)
    const parsed = readContent(real.refs[0]!)
    if (parsed.kind !== 'onchain') throw new Error('expected on-chain content')
    const m = actionMessage(MINTER, legacy, { id: 'metadata', content: buildOnchainContent(parsed.meta) }, false)
    expect(m.payload.equals(real)).toBe(true)
    expect(m.amount).toBe(10000000n)
  })
})

describe('detection', () => {
  // tonapi /blockchain/accounts/{id}/methods/get_next_admin_address, fetched 2026-10-22
  it('reads get_next_admin_address', () => {
    // Jetton 2.1 minter EQABsXLO…: none pending
    expect(parseNextAdmin({ success: true, exit_code: 0, stack: [{ type: 'null' }] })).toEqual({ family: 'v2', nextAdmin: null })
    // USD₮ master (stablecoin): addr_none in a cell
    expect(parseNextAdmin({ success: true, exit_code: 0, stack: [{ type: 'cell', cell: 'b5ee9c7201010101000300000120' }] })).toEqual({ family: 'v2', nextAdmin: null })
    // classic minter -1:a6fddc…: method not found
    expect(parseNextAdmin({ success: false, exit_code: 11, stack: [{ type: 'num', num: '0x1335b' }] })).toEqual({ family: 'legacy', nextAdmin: null })
    expect(parseNextAdmin({ success: false, exit_code: 9, stack: [] })).toBeNull()
  })
  it('pending admin address in the stack', () => {
    const a = '0:63bb8c28c62a782e466e9f7becab6512734596e94f985fa61dfec15a2d9c7ab6'
    const hex = Cell.fromBase64(V21.changeAdmin).beginParse().skip(96).asCell().toBoc().toString('hex')
    expect(parseNextAdmin({ success: true, exit_code: 0, stack: [{ type: 'cell', cell: hex }] })!.nextAdmin).toBe(a)
  })
  it('known code hashes in any encoding', () => {
    expect(flavorByCodeHash('6bf8f48ca97d3fd9c8e553344efe7af030c322459e2ee2197a052162f1961bfb')?.id).toBe('v21')
    expect(flavorByCodeHash('GNW254D_C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=')?.id).toBe('stablecoin')
    expect(detect('AAAA', 'v2')).toEqual({ family: 'v2', flavor: null, metadata: null })
    expect(detect('AAAA', 'legacy')).toEqual({ family: 'legacy', flavor: null, metadata: 'content' })
    expect(detect('AAAA', null)).toBeNull()
  })
})

describe('parseMaster + availableActions', () => {
  // toncenter v3 /jetton/masters?address=EQCxE6mU… (USD₮), trimmed
  const usdt: ToncenterJettonMaster = {
    address: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE',
    total_supply: '1429976002510000',
    mintable: true,
    admin_address: '0:6440FE3C69410383963945173C4B11479BF0B9B4D7090E58777BDA581C2F9998',
    jetton_content: { decimals: '6', uri: 'https://tether.to/usdt-ton.json' },
    jetton_wallet_code_hash: 'iUaPAseOVwgC45l5yFFvw43wfqdqSDV+BTbyuns+43s=',
    code_hash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4='
  }
  const s = parseMaster(usdt)
  const d = detect(s.codeHash, 'v2')!
  it('parses supply, admin and decimals', () => {
    expect(s.totalSupply).toBe(1429976002510000n)
    expect(s.decimals).toBe(6)
    expect(s.admin).toBe('0:6440fe3c69410383963945173c4b11479bf0b9b4d7090e58777bda581c2f9998')
    expect(d.flavor?.id).toBe('stablecoin')
  })
  it('only the admin sees admin actions; the pending admin sees claim', () => {
    // stablecoin-contract has no drop_admin op, so Renounce is not offered
    expect(availableActions(s, d, '0:6440FE3C69410383963945173C4B11479BF0B9B4D7090E58777BDA581C2F9998', null)).toEqual(['mint', 'change-admin', 'metadata'])
    expect(availableActions(s, v21, '0:6440FE3C69410383963945173C4B11479BF0B9B4D7090E58777BDA581C2F9998', null)).toEqual(['mint', 'change-admin', 'drop-admin', 'metadata'])
    expect(availableActions(s, d, `0:${'1'.repeat(64)}`, null)).toEqual([])
    expect(availableActions(s, d, `0:${'1'.repeat(64)}`, `0:${'1'.repeat(64)}`)).toEqual(['claim-admin'])
  })
  it('decimals fall back to the off-chain JSON value when the content has only a uri', () => {
    // shape of toncenter v3 /jetton/masters?address=EQA2kCVN… (STON): jetton_content has only uri, decimals sit in token_info extra
    expect(parseMaster({ ...usdt, jetton_content: { uri: 'https://static.ston.fi/jetton/ston.json' } }, '6').decimals).toBe(6)
    expect(parseMaster(usdt, '9').decimals).toBe(6) // on-chain value wins
  })
  it('zero-address admin means no admin', () => {
    expect(parseMaster({ ...usdt, admin_address: `0:${'0'.repeat(64)}` }).admin).toBeNull()
  })
})
