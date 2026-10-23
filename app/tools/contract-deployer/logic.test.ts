import { Address, beginCell, Cell, loadStateInit, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { ORDER_CODE_B64 } from '~/lib/deployers/codes'
import { HMSTR_JETTON_WALLET_DEPLOY, WALLET_V4R2_DEPLOY } from '~/tools/stateinit-builder/examples'
import { codeFromFile, deployBody, deployMessage, fileToBoc, resolveStateInit, type DeployInput } from './logic'

const base: DeployInput = { mode: 'stateinit', code: '', data: '', stateInit: '', workchain: 0 }

// Real deploys (stateinit-builder/examples.ts cites the mainnet transactions and toncenter init_state hashes).
describe('resolveStateInit', () => {
  it('a wallet v4R2 StateInit gives the address of the account it deployed', () => {
    const info = resolveStateInit({ ...base, stateInit: WALLET_V4R2_DEPLOY.stateInit })
    expect(info.hash).toBe(Buffer.from(WALLET_V4R2_DEPLOY.initHash, 'base64').toString('hex'))
    expect(info.address.nonBounceable).toBe(WALLET_V4R2_DEPLOY.address)
  })
  it('code + data split out of the same StateInit gives the same address', () => {
    const init = loadStateInit(Cell.fromBase64(WALLET_V4R2_DEPLOY.stateInit).beginParse())
    const info = resolveStateInit({ ...base, mode: 'code-data', code: init.code!.toBoc().toString('hex'), data: init.data!.toBoc().toString('base64') })
    expect(info.address.nonBounceable).toBe(WALLET_V4R2_DEPLOY.address)
  })
  it('accepts a whole deploy message (HMSTR jetton wallet, library code)', () => {
    const info = resolveStateInit({ ...base, stateInit: HMSTR_JETTON_WALLET_DEPLOY.message })
    expect(info.address.raw).toBe(HMSTR_JETTON_WALLET_DEPLOY.address)
    expect(info.code?.library).toBeDefined()
  })
  it('masterchain workchain changes only the workchain', () => {
    const info = resolveStateInit({ ...base, stateInit: WALLET_V4R2_DEPLOY.stateInit, workchain: -1 })
    expect(info.address.raw.startsWith('-1:')).toBe(true)
    expect(info.address.raw.slice(3)).toBe(Buffer.from(WALLET_V4R2_DEPLOY.initHash, 'base64').toString('hex'))
  })
  it('readable errors', () => {
    expect(() => resolveStateInit({ ...base, stateInit: 'hello' })).toThrow()
    expect(() => resolveStateInit({ ...base, mode: 'code-data' })).toThrow(/needs code/)
  })
})

describe('message', () => {
  const info = resolveStateInit({ ...base, stateInit: WALLET_V4R2_DEPLOY.stateInit })
  it('bounceable, StateInit attached, optional body', () => {
    const m = deployMessage(info, 50_000_000n, deployBody('comment', 'hi'), true)
    expect(m.address.startsWith('kQ')).toBe(true)
    expect(m.stateInit).toBe(info.boc)
    expect(m.payload!.beginParse().loadUint(32)).toBe(0)
    expect(deployMessage(info, 1n, deployBody('none', ''), false)).not.toHaveProperty('payload')
    expect(deployBody('comment', '')).toBeUndefined()
    expect(() => deployBody('boc', 'zz')).toThrow()
  })
})

describe('files', () => {
  // ORDER_CODE_B64: its hash is the public library toncenter /api/v2/getLibraries returns for 6305a806… on mainnet and testnet.
  const ORDER_HEX = Buffer.from(ORDER_CODE_B64, 'base64').toString('hex')
  it('reads Blueprint build JSON and binary .boc files', () => {
    const fromJson = codeFromFile(JSON.stringify({ hex: ORDER_HEX }))
    expect(Cell.fromHex(fromJson).hash().toString('hex')).toBe('6305a8061c856c2ccf05dcb0df5815c71475870567cab5f049e340bcf59251f3')
    const bin = Uint8Array.from(Buffer.from(ORDER_HEX, 'hex'))
    expect(Cell.fromBase64(fileToBoc(bin)).hash().toString('hex')).toBe('6305a8061c856c2ccf05dcb0df5815c71475870567cab5f049e340bcf59251f3')
    expect(codeFromFile(JSON.stringify({ codeBoc64: 'abc' }))).toBe('abc')
    expect(fileToBoc(new TextEncoder().encode(' te6cc '), ' te6cc ')).toBe('te6cc')
  })
})

describe('end to end in @ton/sandbox', () => {
  it('our message deploys the contract and runs its first transaction', async () => {
    const bc = await Blockchain.create()
    const payer = await bc.treasury('payer')
    const info = resolveStateInit({ ...base, stateInit: WALLET_V4R2_DEPLOY.stateInit })
    const m = deployMessage(info, toNano('0.05'), deployBody('comment', 'deploy'), false)
    const init = loadStateInit(Cell.fromBase64(m.stateInit).beginParse())
    await payer.send({ to: m.address as never, value: m.amount, init, body: m.payload ?? beginCell().endCell(), bounce: true })
    const acc = await bc.getContract(Address.parse(m.address))
    expect(acc.accountState?.type).toBe('active')
    expect((await bc.runGetMethod(acc.address, 'get_public_key')).stackReader.readBigNumber().toString(16).padStart(64, '0')).toBe(WALLET_V4R2_DEPLOY.publicKey)
  })
})
