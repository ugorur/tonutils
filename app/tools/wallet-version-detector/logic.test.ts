import { describe, expect, it } from 'vitest'
import { classifyInput, codeHashTable, inspectAccount, inspectCode, inspectHash } from './logic'
import { parseBoc } from '~/utils/ton/messages'

// Account states from toncenter /api/v3/account (2026-10-22). Expected version: toncenter /api/v3/walletInformation
// wallet_type and the indexer interface for the same account.
const V3R1 = {
  // 0:BD2AE25BA855DF37AB08AD448B33AC0E46664122EAE9F80D3CE803D177BE4D45, wallet_type "wallet v3 r1", seqno 2
  code: 'te6ccgEBAQEAYgAAwP8AIN0gggFMl7qXMO1E0NcLH+Ck8mCDCNcYINMf0x/TH/gjE7vyY+1E0NMf0x/T/9FRMrryoVFEuvKiBPkBVBBV+RDyo/gAkyDXSpbTB9QC+wDo0QGkyMsfyx/L/8ntVA==',
  data: 'te6ccgEBAQEAKgAAUAAAAAIpqaMXs8TWJQfjcogifeDHtkkMGLxOuIH/rf4+7156rWH0gSY='
}
const V5BETA = {
  // 0:B4C4E7EB1C350DC084C44D8D37DC9D62FA596D40F0404F428D6F9B8C14E912A4, wallet_type "wallet v5 beta", seqno 21.
  // Its code is a library cell; same BOC as @ton/ton WalletContractV5Beta.
  code: 'te6ccgEBAQEAIwAIQgLkzzsvTG1qYeoPK1RH0mZ4WyavNjfbLe7mvNGqgm80Eg==',
  data: 'te6ccgEBAQEAMQAAXQAAAAr///+IgAAAAAAAeiDgROVPgwUlEI5SAWnl9WiQ8+KAHs5CC1sKn5y/lEwg'
}

describe('classifyInput', () => {
  it('recognises addresses, hashes and BOCs', () => {
    expect(classifyInput('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N').kind).toBe('address')
    expect(classifyInput('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8').kind).toBe('address')
    // v3r2 code hash, base64 (toncenter code_hash) and hex
    expect(classifyInput('hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=')).toEqual({ kind: 'hash', hashHex: '84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599' })
    expect(classifyInput('84DAFA449F98A6987789BA232358072BC0F76DC4524002A5D0918B9A75D2D599').kind).toBe('hash')
    expect(classifyInput(V3R1.code).kind).toBe('code')
    expect(() => classifyInput('hello')).toThrow()
  })
})

describe('inspect', () => {
  it('detects v3r1 from its code and parses the data', () => {
    const r = inspectAccount(V3R1.code, V3R1.data, { workchain: 0, testOnly: false })
    expect(r.wallet?.version).toBe('v3r1')
    expect(r.hashBase64).toBe('thBBpYp5gLlG6PueGY48kE0keZ/6NldOpCUcQaVm9YE=') // toncenter code_hash
    expect(r.data?.seqno).toBe(2)
    expect(r.data?.publicKey).toBe('b3c4d62507e37288227de0c7b6490c18bc4eb881ffadfe3eef5e7aad61f48126') // tonapi publickey
  })
  it('detects library-cell code (W5 beta)', () => {
    const r = inspectAccount(V5BETA.code, V5BETA.data, { workchain: 0, testOnly: false })
    expect(r.wallet?.version).toBe('v5beta')
    expect(r.libraryHashHex).toBe('e4cf3b2f4c6d6a61ea0f2b5447d266785b26af3637db2deee6bcd1aa826f3412')
    expect(r.data?.seqno).toBe(21)
  })
  it('a hash lookup', () => {
    expect(inspectHash('20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f').wallet?.version).toBe('v5r1')
    expect(inspectHash('00'.repeat(32)).wallet).toBeNull()
  })
  it('unknown code is not a wallet', () => {
    expect(inspectCode(parseBoc('te6ccgEBAQEAAgAAAA==')).wallet).toBeNull()
  })
  it('table covers every known hash with matching hex', () => {
    const t = codeHashTable()
    expect(t.find(r => r.version === 'v4r2')?.hex).toBe('feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0')
  })
})
