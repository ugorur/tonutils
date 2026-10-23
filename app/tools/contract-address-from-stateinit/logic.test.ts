import { describe, expect, it } from 'vitest'
import { USDT_JETTON_WALLET, WALLET_V4R2 } from './examples'
import { fromCodeData, fromStateInitBoc, splitStateInit } from './logic'

// Expected addresses are the accounts the StateInits actually deployed on mainnet (toncenter v3).
// Wallet v4r2 code hash: the well-known feb5ff68… (tonkeeper/ton docs wallet table).
const V4R2_CODE_HASH = 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0'

describe('fromStateInitBoc', () => {
  it('derives the deployed wallet v4r2 address', () => {
    const r = fromStateInitBoc(WALLET_V4R2.boc)
    expect(r.raw).toBe(WALLET_V4R2.address)
    expect(r.nonBounceable).toBe('UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4')
    expect(r.bounceable).toBe('EQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3Fy9')
    expect(r.codeHash).toBe(V4R2_CODE_HASH)
    expect(r.stateInitHash).toBe(WALLET_V4R2.address.slice(2))
    expect(r).toMatchObject({ splitDepth: null, special: null, libraries: 0 })
  })

  it('derives a USD₮ jetton wallet address (library-cell code)', () => {
    expect(fromStateInitBoc(USDT_JETTON_WALLET.boc).raw).toBe(USDT_JETTON_WALLET.address)
  })

  it('accepts hex and the masterchain', () => {
    const hex = Buffer.from(WALLET_V4R2.boc, 'base64').toString('hex')
    expect(fromStateInitBoc(hex, -1).raw).toBe(`-1:${WALLET_V4R2.address.slice(2)}`)
  })

  it('rejects cells that are not a StateInit', () => {
    const { code } = splitStateInit(WALLET_V4R2.boc)
    expect(() => fromStateInitBoc(code)).toThrow(/not a StateInit/)
    expect(() => fromStateInitBoc('nope')).toThrow(/Not a valid BOC/)
    expect(() => fromStateInitBoc(WALLET_V4R2.boc, 5)).toThrow(/Workchain/)
  })
})

describe('fromCodeData', () => {
  it.each([WALLET_V4R2, USDT_JETTON_WALLET])('rebuilds the same address from code + data ($address)', (v) => {
    const { code, data } = splitStateInit(v.boc)
    const r = fromCodeData(code, data)
    expect(r.raw).toBe(v.address)
    expect(r.stateInitBoc).toBe(fromStateInitBoc(v.boc).stateInitBoc)
  })

  it('accepts a Blueprint build JSON for the code', () => {
    const { code, data } = splitStateInit(WALLET_V4R2.boc)
    const json = JSON.stringify({ hash: V4R2_CODE_HASH, hex: Buffer.from(code, 'base64').toString('hex') })
    expect(fromCodeData(json, data).raw).toBe(WALLET_V4R2.address)
  })

  it('reports which field is wrong', () => {
    expect(() => fromCodeData('', '')).toThrow(/Paste the contract code/)
    expect(() => fromCodeData(splitStateInit(WALLET_V4R2.boc).code, 'zz')).toThrow(/Data is not a valid BOC/)
  })
})
