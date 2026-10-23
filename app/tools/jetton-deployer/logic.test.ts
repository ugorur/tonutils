import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildOnchainContent, JETTON_V21_MINTER_CODE_B64, planDeploy, readContent } from '~/lib/token-launch/jetton-minter'
import { deployMessages, validateForm, type DeployForm } from './logic'

// Real mainnet deploy of a Jetton 2.1 minter made with minter.ton.org, read from toncenter v3
// /transactions?account=EQABsXLOFJD754hGq4oUsN54Bczm5AklOfhpA5MIFPjbmD1q&sort=asc (tx aDYdrpQ9BRLSkx5ExauZnlgduyT+7xxwb2bixEpo/xg=).
const DEPLOY = {
  minter: '0:01b172ce1490fbe78846ab8a14b0de7805cce6e4092539f86903930814f8db98',
  owner: '0:87fc152447508a68b35306e8bc1c950fb17e387e5d775c5149be2c142610b24b',
  value: 150000000n,
  queryId: 1083895200524364n,
  mintAmount: 10000000000000n,
  // in_msg.message_content.hash
  bodyHash: 'jdCebPjZ9AMaCbqIdqyF1v2vifn+IH/pw2LQQYvLU4E=',
  // on-chain content of that minter (TEP-64 on-chain dict, read from its init_state data)
  meta: { name: 'FRB', description: '该福瑞币只作为纪念使用无任何价值', image: 'https://ibb.co/gL0JRxGT', symbol: '福瑞币', decimals: '9' }
}

// Real drop_admin body sent to a Jetton 2.1 minter (toncenter v3 /messages?opcode=0x7431f221, msg 7O1mwPXykfSpc4BLIN9VxZn2r9K5n9CQTzZCFbujCgo=).
const DROP_ADMIN_BOC = 'te6cckEBAQEADgAAGHQx8iEAAAAAAAAAAJm1rE4='

const form = (p: Partial<DeployForm> = {}): DeployForm => ({
  name: 'My Token', symbol: 'MYT', decimals: '9', description: '', image: '', supply: '1000000', mode: 'onchain', uri: '', ...p
})

describe('Jetton 2.1 minter code', () => {
  it('is the exact code minter.ton.org ships and mainnet runs', () => {
    // hash from ton-blockchain/minter src/lib/jetton-v2.ts JETTON_V2_MINTER_CODE_HASH; same as toncenter code_hash of EQABsXLO…
    expect(Cell.fromBase64(JETTON_V21_MINTER_CODE_B64).hash().toString('hex')).toBe('6bf8f48ca97d3fd9c8e553344efe7af030c322459e2ee2197a052162f1961bfb')
  })
})

describe('planDeploy (real mainnet deploy)', () => {
  const p = planDeploy({ owner: Address.parse(DEPLOY.owner), content: buildOnchainContent(DEPLOY.meta), mintAmount: DEPLOY.mintAmount, queryId: DEPLOY.queryId })

  it('lands on the same minter address (state init identical)', () => {
    expect(p.address.toRawString()).toBe(DEPLOY.minter)
    expect(p.stateInit.hash().toString('base64')).toBe('AbFyzhSQ++eIRquKFLDeeAXM5uQJJTn4aQOTCBT425g=')
  })
  it('builds the same mint body and value', () => {
    expect(p.body.hash().toString('base64')).toBe(DEPLOY.bodyHash)
    expect(p.value).toBe(DEPLOY.value)
  })
  it('content round-trips', () => {
    expect(readContent(buildOnchainContent(DEPLOY.meta))).toEqual({ kind: 'onchain', meta: DEPLOY.meta })
  })
})

describe('deployMessages', () => {
  const p = planDeploy({ owner: Address.parse(DEPLOY.owner), content: buildOnchainContent(DEPLOY.meta), mintAmount: 1n })
  it('one message with state init, bounceable to the minter', () => {
    const [m, ...rest] = deployMessages(p, false, false)
    expect(rest).toHaveLength(0)
    expect(m!.address).toBe('EQABsXLOFJD754hGq4oUsN54Bczm5AklOfhpA5MIFPjbmD1q')
    expect(m!.stateInit).toBe(p.stateInit)
  })
  it('renounce adds the real drop_admin body as a second message', () => {
    const msgs = deployMessages(p, true, true)
    expect(msgs).toHaveLength(2)
    expect(msgs[1]!.address).toBe('kQABsXLOFJD754hGq4oUsN54Bczm5AklOfhpA5MIFPjbmIbg')
    expect(msgs[1]!.stateInit).toBeUndefined()
    expect(msgs[1]!.payload.equals(Cell.fromBase64(DROP_ADMIN_BOC))).toBe(true)
    expect(msgs[1]!.amount).toBe(50000000n)
  })
})

describe('validateForm', () => {
  it('accepts a normal token and scales the supply by decimals', () => {
    const r = validateForm(form({ decimals: '6', supply: '1,000.5'.replace(',', '') }))
    expect(r.errors).toEqual({})
    expect(r.mintAmount).toBe(1000500000n)
    expect(readContent(r.content!)).toEqual({ kind: 'onchain', meta: { name: 'My Token', symbol: 'MYT', decimals: '6' } })
  })
  it('rejects bad input with readable messages', () => {
    const r = validateForm(form({ name: '', symbol: 'MY T', decimals: '19', supply: '0', image: 'http://x.png' }))
    expect(Object.keys(r.errors).sort()).toEqual(['decimals', 'image', 'name', 'supply', 'symbol'])
    expect(r.content).toBeUndefined()
  })
  it('rejects more decimals than allowed and overflow', () => {
    expect(validateForm(form({ decimals: '2', supply: '1.234' })).errors.supply).toBeTruthy()
    expect(validateForm(form({ decimals: '18', supply: '1' + '0'.repeat(30) })).errors.supply).toMatch(/2\^120/)
  })
  it('off-chain mode only needs the JSON URL', () => {
    const r = validateForm(form({ mode: 'offchain', name: '', symbol: '', uri: 'https://example.org/jetton.json' }))
    expect(r.errors).toEqual({})
    expect(readContent(r.content!)).toEqual({ kind: 'offchain', uri: 'https://example.org/jetton.json' })
    expect(validateForm(form({ mode: 'offchain', uri: 'example.org/x.json' })).errors.uri).toBeTruthy()
  })
})
