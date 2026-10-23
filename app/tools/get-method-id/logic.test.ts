import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { contractMethods, isHashedId, lookupId, methodId, methodIdsFromCode, methodIds, parseMethodIdInput, signed19 } from './logic'

// Code of the USD₮ jetton master EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs, toncenter v3 /accountStates (2026-10-22).
// toncenter's own parser reports contract_methods = [0, 20, 78683, 103289, 106029] for it.
const USDT_MASTER_CODE = 'te6ccgECGAEABbsAART/APSkE/S88sgLAQIBYgIDAgLLBAUCASAUFQLz0MtDTAwFxsI47MIAg1yHTHwGCEBeNRRm6kTDhgEDXIfoAMO1E0PoA+kD6QNTU0VBFoUE0yFAF+gJQA88WAc8WzMzJ7VTg+kD6QDH6ADH0AfoAMfoAATFw+DoC0x8BAdM/ARLtRND6APpA+kDU1NEmghBkK30HuuMCJoGBwAdojhkZYOA54tkgUGD+gvAAZY1NVFhxwXy4EkE+kAh+kQwwADy4U36ANTRINDTHwGCEBeNRRm68uBIgEDXIfoA+kAx+kAx+gAg1wsAmtdLwAEBwAGw8rGRMOJUQxsIA/qCEHvdl966juc2OAX6APpA+ChUEgpwVGAEExUDyMsDWPoCAc8WAc8WySHIywET9AAS9ADLAMn5AHB0yMsCygfL/8nQUAjHBfLgShKhRBRQZgPIUAX6AlADzxYBzxbMzMntVPpA0SDXCwHAALORW+MN4CaCECx2uXO64wI1JQoLDAGOIZFykXHi+DkgbpOBJCeRIOIhbpQxgShzkQHiUCOoE6BzgQOjcPg8oAJw+DYSoAFw+Dagc4EECYIQCWYBgHD4N6C88rAlWX8JAOyCEDuaygBw+wL4KEUEcFRgBBMVA8jLA1j6AgHPFgHPFskhyMsBE/QAEvQAywDJIPkAcHTIywLKB8v/ydDIgBgBywUBzxZY+gICmFh3UAPLa8zMlzABcVjLasziyYAR+wBQBaBDFMhQBfoCUAPPFgHPFszMye1UAETIgBABywUBzxZw+gJwActqghDVMnbbAcsfAQHLP8mAQvsAAfwUXwQyNAH6QNIAAQHRlcghzxbJkW3iyIAQAcsFUATPFnD6AnABy2qCENFzVAAByx9QBAHLPyP6RDDAAI41+ChEBHBUYAQTFQPIywNY+gIBzxYBzxbJIcjLARP0ABL0AMsAyfkAcHTIywLKB8v/ydASzxaXMWwScAHLAeL0AMkNBPiCEGUB81S6jiIxNDZRRccF8uBJAvpA0RA0AshQBfoCUAPPFgHPFszMye1U4CWCEPuI4Rm6jiEyNDYD0VExxwXy4EmLAlUSyFAF+gJQA88WAc8WzMzJ7VTgNCSCECNcr1K64wI3I4IQy4YpArrjAjZbIIIQJQjWarrjAmwxDg8QEQAIgFD7AALsMDEyUDPHBfLgSfpA+gDU0SDQ0x8BAYBA1yEhghAPin6luo5NNiCCEFlfB7y6jiwwBPoAMfpAMfQB0SD4OSBulDCBFp/ecYEC8nD4OAFw+DaggRp3cPg2oLzysI4TghDu0jbTupUE0wMx0ZQ08sBI4uLjDVADcBITAEQzUULHBfLgSchQA88WyRNEQMhQBfoCUAPPFgHPFszMye1UAB4wAscF8uBJ1NTRAe1U+wQAGIIQ03IVjLrchA/y8ADOMfoAMfpAMfpAMfQB+gAg1wsAmtdLwAEBwAGw8rGRMOJUQhYhkXKRceL4OSBuk4EkJ5Eg4iFulDGBKHORAeJQI6gToHOBA6Nw+DygAnD4NhKgAXD4NqBzgQQJghAJZgGAcPg3oLzysADAghA7msoAcPsC+ChFBHBUYAQTFQPIywNY+gIBzxYBzxbJIcjLARP0ABL0AMsAySD5AHB0yMsCygfL/8nQyIAYAcsFAc8WWPoCAphYd1ADy2vMzJcwAXFYy2rM4smAEfsAACW9mt9qJofQB9IH0gampoiBIvgkAgJxFhcAha289qJofQB9IH0gampoii+CfBQAuCowAgmKgeRlgax9AQDniwDni2SQ5GWAifoACXoAZYBk/IA4OmRlgWUD5f/k6EAAz68W9qJofQB9IH0gampov5noNsF4OHLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+YseApBeHdAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfRYm0eAo4ZGWD+gBkoYBA'
// Library code behind the USD₮ jetton wallet 0:1A86DAD1…9398 (library 8F452D7A…3D68, toncenter v2 getLibraries).
const USDT_WALLET_LIB = 'te6ccgECDwEAA9EAART/APSkE/S88sgLAQIBYgIDAvjQAdDTAwFxsI5IE18DgCDXIe1E0NMD+gD6QPpA0QTTHwGEDyGCEBeNRRm6AoIQe92X3roSsfL0gEDXIfoAMBKgQBMDyMsDWPoCAc8WAc8Wye1U4PpA+kAx+gAx9AH6ADH6AAExcPg6AtMfASCCEA+KfqW6joUwNFnbPOAzBAUCASANDgHyA9M/AQH6APpAIfpEMMAA8uFN7UTQ0wP6APpA+kDRUwnHBSRxsMAAIbHyrVIrxwVQCrHy4ElRFaEgwv/yr/gqVCWQcFRgBBMVA8jLA1j6AgHPFgHPFskhyMsBE/QAEvQAywDJIPkAcHTIywLKB8v/ydAE+kD0AfoAIAYC0CKCEBeNRRm6joQyWts84DQhghBZXwe8uo6EMQHbPOAyIIIQ7tI207qOLzABgEDXIdMD0e1E0NMD+gD6QPpA0TNRQscF8uBKQDMDyMsDWPoCAc8WAc8Wye1U4GwhghDTchWMutyED/LwCAkBmCDXCwCa10vAAQHAAbDysZEw4siCEBeNRRkByx9QCgHLP1AI+gIjzxYBzxYm+gJQB88WyciAGAHLBVAEzxZw+gJAY3dQA8trzMzJRTcHALQhkXKRceL4OSBuk4EkJ5Eg4iFulDGBKHORAeJQI6gToHOBA6Nw+DygAnD4NhKgAXD4NqBzgQQJghAJZgGAcPg3oLzysASAUPsAWAPIywNY+gIBzxYBzxbJ7VQD9O1E0NMD+gD6QPpA0SNysMAC8m0H0z8BAfoAUUGgBPpA+kBTuscF+CpUZOBwVGAEExUDyMsDWPoCAc8WAc8WySHIywET9AAS9ADLAMn5AHB0yMsCygfL/8nQUAzHBRux8uBKCfoAIZJfBOMNJtcLAcAAs5MwbDPjDVUCCgsMAfLtRNDTA/oA+kD6QNEG0z8BAfoA+kD0AdFRQaFSiMcF8uBJJsL/8q/IghB73ZfeAcsfWAHLPwH6AiHPFljPFsnIgBgBywUmzxZw+gIBcVjLaszJA/g5IG6UMIEWn95xgQLycPg4AXD4NqCBGndw+DagvPKwAoBQ+wADDABgyIIQc2LQnAHLHyUByz9QBPoCWM8WWM8WyciAEAHLBSTPFlj6AgFxWMtqzMmAEfsAAHpQVKH4L6BzgQQJghAJZgGAcPg3tgly+wLIgBABywVQBc8WcPoCcAHLaoIQ1TJ22wHLH1gByz/JgQCC+wBZACADyMsDWPoCAc8WAc8Wye1UACe/2BdqJoaYH9AH0gfSBomfwVIJhAAhvFCPaiaGmB/QB9IH0gaK+Bw='

describe('methodId', () => {
  it.each([
    // docs.ton.org / spec vectors
    ['seqno', 85143],
    ['get_wallet_address', 103289],
    ['get_jetton_data', 106029],
    ['get_next_admin_address', 78683]
  ])('%s = %i', (name, id) => {
    expect(methodId(name).id).toBe(id)
  })

  it('matches the method dictionary of a live Telegram username NFT', () => {
    // toncenter v3 accountStates contract_methods of 0:6602941E…E8FB (teleitem) and tonapi get_methods names for it
    const onchain = [0, 38, 39, 40, 41, 42, 44, 66763, 69506, 85719, 102351, 122498, 123660, 129619, 524287]
    for (const n of ['dnsresolve', 'get_full_domain', 'get_nft_data', 'get_telemint_token_name', 'royalty_params', 'get_telemint_auction_state', 'get_telemint_auction_config'])
      expect(onchain).toContain(methodId(n).id)
  })

  it('formats hex and handles reserved entry points', () => {
    expect(methodId(' seqno ')).toMatchObject({ name: 'seqno', hex: '0x14c97' })
    expect(methodId('recv_internal')).toMatchObject({ id: 0 })
    expect(methodId('recv_external')).toMatchObject({ id: -1, hex: '-0x1' })
    expect(methodId('run_ticktock').id).toBe(-2)
  })

  it('rejects empty names and spaces', () => {
    expect(() => methodId('  ')).toThrow(/Enter/)
    expect(() => methodId('get data')).toThrow(/spaces/)
  })

  it('handles a list', () => {
    const r = methodIds('seqno\nget_public_key, seqno\n\nbad name')
    expect(r).toHaveLength(3)
    expect(r[1]).toMatchObject({ name: 'get_public_key', id: 78748 })
    expect(r[2]).toHaveProperty('error')
  })
})

describe('reverse lookup', () => {
  it('parses decimal and hex ids', () => {
    expect(parseMethodIdInput('85143')).toBe(85143)
    expect(parseMethodIdInput('0x14C97')).toBe(85143)
    expect(parseMethodIdInput('-1')).toBe(-1)
    expect(parseMethodIdInput('seqno')).toBeNull()
  })

  it('finds known names', () => {
    expect(lookupId(85143).map(m => m.name)).toEqual(['seqno'])
    expect(lookupId(0).map(m => m.name)).toEqual(['main', 'recv_internal'])
    expect(lookupId(12345)).toEqual([])
    expect(isHashedId(85143)).toBe(true)
    expect(isHashedId(20)).toBe(false)
  })

  it('maps unsigned 19-bit keys back to signed ids', () => {
    // toncenter v3 accountStates contract_methods lists recv_external as 524287 (see the W5 vector below)
    expect(signed19(524287)).toBe(-1)
    expect(signed19(524286)).toBe(-2)
    expect(signed19(106029)).toBe(106029)
    expect(signed19(0)).toBe(0)
  })
})

describe('methodIdsFromCode', () => {
  it('reads the method dictionary like toncenter does', () => {
    expect(methodIdsFromCode(Cell.fromBase64(USDT_MASTER_CODE))).toEqual([0, 20, 78683, 103289, 106029])
  })

  it('reads library code (jetton wallet: get_wallet_data per tonapi, plus get_status)', () => {
    const ids = methodIdsFromCode(Cell.fromBase64(USDT_WALLET_LIB))!
    expect(ids).toContain(methodId('get_wallet_data').id)
    expect(ids).toContain(methodId('get_status').id)
  })

  it('returns null for code without a method dictionary (wallet v3r2 dispatches by hand)', () => {
    // code of EQCD39VS…xqB2N (wallet_v3r2), toncenter v3 accountStates: SETCP0 then PUSHINT 85143-style dispatch
    expect(methodIdsFromCode(Cell.fromBase64('te6ccgEBAQEAcQAA3v8AIN0gggFMl7ohggEznLqxn3Gw7UTQ0x/THzHXC//jBOCk8mCDCNcYINMf0x/TH/gjE7vyY+1E0NMf0x/T/9FRMrryoVFEuvKiBPkBVBBV+RDyo/gAkyDXSpbTB9QC+wDo0QGkyMsfyx/L/8ntVA=='))).toBeNull()
  })
})

describe('contractMethods (toncenter responses recorded 2026-10-22, client stubbed)', () => {
  it('resolves a library-code jetton wallet', async () => {
    const calls: string[] = []
    const tc = {
      async v3<T>(path: string) {
        calls.push(path)
        return { accounts: [{ status: 'active', code_boc: 'te6ccgEBAQEAIwAIQgKPRS16Tf10BmtoI2UXclntBXNENb52tf1L1divK3w9aA==', contract_methods: null, interfaces: ['jetton_wallet_governed'] }] } as T
      },
      async v2<T>(method: string, q?: Record<string, string>) {
        calls.push(method + ':' + q?.libraries)
        return { result: [{ data: USDT_WALLET_LIB }] } as T
      }
    }
    const r = await contractMethods('0:1A86DAD1D92803A711846062FA9A5D99CC0E4EA3700F5590612442455BAB9398', tc)
    expect(calls).toEqual(['accountStates', 'getLibraries:8F452D7A4DFD74066B682365177259ED05734435BE76B5FD4BD5D8AF2B7C3D68'])
    expect(r.source).toBe('library')
    expect(r.rows?.map(x => [x.id, x.kind, x.names])).toEqual([[0, 'entry', 'main, recv_internal'], [97026, 'getter', 'get_wallet_data'], [100881, 'getter', 'get_status']])
  })

  it('prefers toncenter contract_methods and rejects inactive accounts', async () => {
    const tc = (acc: object) => ({ v3: async <T>() => ({ accounts: [acc] }) as T, v2: async <T>() => ({}) as T })
    const r = await contractMethods('x', tc({ status: 'active', code_boc: USDT_MASTER_CODE, contract_methods: [106029, 0, 20, 78683, 103289] }))
    expect(r.source).toBe('toncenter')
    expect(r.rows?.map(x => x.kind)).toEqual(['entry', 'procedure', 'getter', 'getter', 'getter'])
    await expect(contractMethods('x', tc({ status: 'uninit' }))).rejects.toThrow(/uninit/)
    // toncenter v3 accountStates of the W5 wallet 0:B41BEF5A…CE42 (2026-10-23): contract_methods lists recv_external
    // as 524287, while the code's own method dictionary (signed 19-bit keys) has -1.
    const w5 = await contractMethods('x', tc({ status: 'active', code_boc: USDT_MASTER_CODE, contract_methods: [0, 78748, 81467, 85143, 88459, 117729, 524287] }))
    expect(w5.rows?.[0]).toMatchObject({ id: -1, kind: 'entry', names: 'recv_external' })
  })
})
