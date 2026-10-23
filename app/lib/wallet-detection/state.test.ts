import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { decodeW5WalletId, highloadProcessed, parseHighloadV3Data, parseVestingData, parseWalletData, usedQueryIds, vestingLockedAmount } from './state'

// Highload v3 0:F2DC1860…496B, data from toncenter /api/v3/account (last_transaction_lt 111674913000025).
// Expected values: the contract's own getters through toncenter /api/v3/runGetMethod on the same state.
const HL_DATA = 'te6ccgECBQEAAUMAAl7N6I66JBOLdbsnRVY5ULl0/tWa3uXVUy3XuYeH6VuO5QAAEK3AAAAAGraKoYAcIAECAQW0MxADAQW0MxAEAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQD/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE='

describe('parseHighloadV3Data', () => {
  const st = parseHighloadV3Data(Cell.fromBase64(HL_DATA))
  it('reads the storage fields', () => {
    expect(st.publicKey).toBe('cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5')
    expect(st.subwalletId).toBe(4269)
    expect(st.timeout).toBe(7200)
  })
  // processed?(q, 0) on-chain: 418032 -> -1, 418093 -> -1, 1000 -> 0, 417892 -> 0
  it.each([[418032, true], [418093, true], [1000, false], [417892, false]])('processed?(%i) = %s', (q, want) => {
    expect(highloadProcessed(st, q)).toBe(want)
  })
  it('need_clean drops windows older than two timeouts', () => {
    expect(highloadProcessed(st, 418093, st.lastCleanTime + st.timeout * 2 + 1)).toBe(false)
    // one timeout later: current window becomes old, still processed
    expect(highloadProcessed(st, 418093, st.lastCleanTime + st.timeout + 1)).toBe(true)
    expect(highloadProcessed(st, 418032, st.lastCleanTime + st.timeout + 1)).toBe(false)
  })
  it('lists used ids', () => {
    expect(usedQueryIds(st.queries)).toContain(418093)
    expect(usedQueryIds(st.queries)).not.toContain(417892)
  })
})

// Vesting 0:D68969D4…2E18 (EQDWiWnU…uGNNS), data from toncenter /api/v3/account.
// Expected: get_vesting_data and get_locked_amount(t) via toncenter /api/v3/runGetMethod, 2026-10-22.
const VEST_DATA = 'te6ccgEBAwEAswACUQAAAAkAAAEMDLNM9jlozW7dKUbMZ8oGtykp6nWsZ1gGFIIEsJl7e/DAAQIARaEf4hTzsQ9S8I1WhXGBJuXKe2N/PqNi1gGR/71g2snqt0MYAL0AAAAAZxIjkAdqcAAAJ40AAdqcAHBhQWy7kEAIATO4U1sMKqJDkWGdNuqoWi4p4NZ/SF6o5bL37DuPHSCRAAG3pIvsXdFJVKVLmf+bh+9zMUcM51RNoysUgCWv8Q3q4A=='

describe('vesting', () => {
  const v = parseVestingData(Cell.fromBase64(VEST_DATA))
  it('matches get_vesting_data', () => {
    expect(v.startTime).toBe(0x67122390)
    expect(v.totalDuration).toBe(0x76a7000)
    expect(v.unlockPeriod).toBe(0x278d00)
    expect(v.cliffDuration).toBe(0x1da9c00)
    expect(v.totalAmount).toBe(0x61416cbb90400n)
    expect(v.sender!.equals(Address.parse('UQCZ3CmthhVRIciwzpt1VC0XFPBrP6QvVHLZe_Ydx46QSHGU'))).toBe(true)
    expect(v.owner!.equals(Address.parse('UQAG3pIvsXdFJVKVLmf-bh-9zMUcM51RNoysUgCWv8Q3q7N-'))).toBe(true)
    // toncenter /api/v3/vesting whitelist
    expect(v.whitelist).toEqual(['-1:10a79d887a97846ab42b8c09372e53db1bf9f51b16b00c8ffdeb06d64f55ba18'])
    expect(v.seqno).toBe(9)
    expect(v.subwalletId).toBe(268)
  })
  it.each([
    [1729242000, 0x61416cbb90400n],
    [1760345999, 0x61416cbb90400n],
    [1760346000, 0x48f1118cac300n],
    [1792687033, 0x30a0b65dc8200n],
    [1853657999, 0x206b243e856bn],
    [1853658000, 0n]
  ])('get_locked_amount(%i)', (t, want) => {
    expect(vestingLockedAmount(v, t)).toBe(want)
  })
})

// Wallet data from toncenter /api/v3/account; expected seqno / wallet_id from toncenter /api/v3/walletInformation
// at the same last_transaction_lt, public keys from tonapi /v2/accounts/{id}/publickey (2026-10-22).
describe('parseWalletData', () => {
  const cases: [string, string, string, number, string | null, string?][] = [
    // [address (lt), version, data, seqno, public key, wallet id]
    ['0:7A0BB61A…9583 (109036774000007)', 'v1r3', 'te6ccgEBAQEAJgAASAAAAAGkDVBGMMfctIw4AwYrjqhH7CGMO7mQXd4FeevnaeUxDQ==', 1, 'a40d504630c7dcb48c3803062b8ea847ec218c3bb9905dde0579ebe769e5310d'],
    ['0:BD2AE25B…4D45 (108421946000018)', 'v3r1', 'te6ccgEBAQEAKgAAUAAAAAIpqaMXs8TWJQfjcogifeDHtkkMGLxOuIH/rf4+7156rWH0gSY=', 2, 'b3c4d62507e37288227de0c7b6490c18bc4eb881ffadfe3eef5e7aad61f48126', '698983191'],
    ['0:F8B8635D…5360 (111639964000007)', 'v4r2', 'te6ccgEBAQEAKwAAUQAAARUpqaMXdJEYk6MFWiRfp22SKErFxQ7KO/ru/YhQPHSnG2If5B1A', 277, '74911893a3055a245fa76d92284ac5c50eca3bfaeefd88503c74a71b621fe41d', '698983191'],
    ['0:4DA6D2AD…1381 (111642917000022)', 'v5r1', 'te6ccgEBAQEAKwAAUYAAAAK///+Ixmky0DnG9K6qXAK/TUXiQqJDd6l4SDwNnjG7E8FfVIOg', 5, '8cd265a0738de95d54b8057e9a8bc4854486ef52f090781b3c63762782bea907', '2147483409'],
    ['0:B4C4E7EB…12A4 (108488280000005)', 'v5beta', 'te6ccgEBAQEAMQAAXQAAAAr///+IgAAAAAAAeiDgROVPgwUlEI5SAWnl9WiQ8+KAHs5CC1sKn5y/lEwg', 21, null],
    ['0:8ABA11FA…B30E (111675857000007)', 'highload-v2', 'te6ccgEBAgEAPAABWSmpoxdq2jrOAAAAAG1arO9RzWy5sFsz6UdTBLPo0zhqm2Ea3AINN722QFGRwAEAE6A1bR4cAAAAAEA=', -1, '6d5aacef51cd6cb9b05b33e9475304b3e8d3386a9b611adc020d37bdb6405191']
  ]
  it.each(cases)('%s %s', (_, version, data, seqno, pk, walletId) => {
    const r = parseWalletData(version, Cell.fromBase64(data))
    expect(r.seqno).toBe(seqno === -1 ? null : seqno)
    if (pk) expect(r.publicKey).toBe(pk)
    if (walletId) expect(r.fields.find(f => /id$/.test(f.label))?.value).toBe(walletId)
  })
  it('v5r1 flags and wallet id context', () => {
    const r = parseWalletData('v5r1', Cell.fromBase64(cases[3]![2]))
    expect(r.fields.find(f => f.label === 'Signature allowed')?.value).toBe('Yes') // toncenter is_signature_allowed: true
    expect(r.fields.find(f => f.label === 'Extensions')?.value).toBe('None')
  })
  // @ton/ton WalletV5R1WalletId: mainnet client context, workchain 0, subwallet 0 -> 2147483409
  it('decodes W5 wallet ids', () => {
    expect(decodeW5WalletId(2147483409)).toMatchObject({ network: 'mainnet', text: 'mainnet (-239), workchain 0, subwallet 0' })
    expect(decodeW5WalletId((-3 ^ 0x80000000) >>> 0, 'testnet')).toMatchObject({ network: 'testnet', text: 'testnet (-3), workchain 0, subwallet 0' })
  })
  it('versions without a layout return no fields instead of throwing', () => {
    expect(parseWalletData('multisig-v2', Cell.fromBase64(VEST_DATA))).toEqual({ publicKey: null, seqno: null, fields: [] })
  })
  it('vesting data via the generic parser', () => {
    const r = parseWalletData('vesting', Cell.fromBase64(VEST_DATA))
    expect(r.seqno).toBe(9)
    expect(r.fields.find(f => f.label === 'Vesting owner')?.value).toBe('UQAG3pIvsXdFJVKVLmf-bh-9zMUcM51RNoysUgCWv8Q3q7N-')
  })
})

it('highload v2 last_cleaned is a query id (time in the high 32 bits)', () => {
  // toncenter account 0:8ABA11FA…B30E at lt 111675857000007; last_cleaned 0x6ada3ace00000000
  const r = parseWalletData('highload-v2', Cell.fromBase64('te6ccgEBAgEAPAABWSmpoxdq2jrOAAAAAG1arO9RzWy5sFsz6UdTBLPo0zhqm2Ea3AINN722QFGRwAEAE6A1bR4cAAAAAEA='))
  expect(r.fields.find(f => f.label === 'Last cleaned')?.value).toBe(new Date(0x6ada3ace * 1000).toISOString())
})
