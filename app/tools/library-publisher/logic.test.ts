import { Cell, Dictionary, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { ORDER_CODE_B64 } from '~/lib/deployers/codes'
import { parseConfig18 } from '~/tools/unfreeze-account/logic'
import { FEE_BUFFER, isPublished, planLibrary, publishCost, publishMessage } from './logic'

// Mainnet tx 6dJ9QiUiUyXEGAX28qun8UM/duZhfyjXWZ98zi5CZUU= (2024-05-10, toncenter /api/v3/transactions): 1 TON from
// 0:8B1BFA76…07B9 to the librarian for the multisig v2 Order code. in_msg.init_state.hash is the account id; compute used
// 5652 gas, total fees 59853282, and one outgoing message of 933480000: 1 TON was far below the 10-year reserve, so the
// action phase failed and the value bounced (the library was never published by it).
const MAINNET_LIBRARIAN = '-1:979dd7faa1b46704d6a2fc61e1a5b65b1b26f76e3c6c8828773b08c38ba39049'
const MAINNET_INIT_HASH = 'l53X+qG0ZwTWovxh4aW2Wxsm9248bIgodzsIw4ujkEk='
const MAINNET_FEES = 59853282n
const MAINNET_BOUNCED = 933480000n
// toncenter /api/v2/getConfigParam?config_id=18, 2026-10-23.
const CONFIG_18 = 'te6cckEBAwEAWQACAUgBAgBM3swAAAAAAAAAAAAAAAEAAAAAAAAB9AAAAAAAAAPoAAAAAAAHoSAAU71Pk/sGY0+T+wAAAAAAAAAAAAAAAAAAAAQ4AAAAAAAAH0AAAAAAAD0JBPXsekg='
// toncenter /api/v2/getLibraries?libraries=6305a806…, 2026-10-23 (data trimmed: only the hash is compared).
const GET_LIBRARIES = [{ hash: 'YwWoBhyFbCzPBdyw31gVxxR1hwVnyrXwSeNAvPWSUfM=', data: 'te6ccgECDAEAA3YAART/' }]

const order = () => Cell.fromBase64(ORDER_CODE_B64)

describe('planLibrary', () => {
  it('gives the librarian address and StateInit hash of the real mainnet deploy', () => {
    const plan = planLibrary(order())
    expect(plan.address.toRawString()).toBe(MAINNET_LIBRARIAN)
    expect(plan.stateInit.hash().toString('base64')).toBe(MAINNET_INIT_HASH)
    expect(plan.hash).toBe('6305a8061c856c2ccf05dcb0df5815c71475870567cab5f049e340bcf59251f3')
    expect(plan.cells).toBe(12n)
  })
  it('the reference cell is an exotic library cell pointing at the hash', () => {
    const { ref, hash } = planLibrary(order())
    expect(ref.isExotic).toBe(true)
    expect(ref.bits.length).toBe(8 + 256)
    expect(ref.beginParse(true).skip(8).loadBuffer(32).toString('hex')).toBe(hash)
  })
  it('refuses exotic cells', () => {
    expect(() => planLibrary(planLibrary(order()).ref)).toThrow(/exotic/)
  })
})

describe('publishCost', () => {
  it('10 years of masterchain storage at the live config 18 prices', () => {
    const p = parseConfig18(CONFIG_18)
    expect(p).toMatchObject({ mcBit: 1000n, mcCell: 500000n })
    const c = publishCost(p, planLibrary(order()))
    // (6765 bits * 1000 + 12 cells * 500000) * 315360000 s / 2^16, rounded up
    expect(c.storage).toBe(61425329590n)
    expect(c.amount).toBe(c.storage + FEE_BUFFER)
  })
})

describe('isPublished', () => {
  it('reads the base64 hashes toncenter returns', () => {
    expect(isPublished(GET_LIBRARIES, '6305A8061C856C2CCF05DCB0DF5815C71475870567CAB5F049E340BCF59251F3')).toBe(true)
    expect(isPublished([], '6305a806')).toBe(false)
  })
})

// The official librarian, run with our exact message: it must publish the library and keep what we predicted.
describe('end to end in @ton/sandbox', () => {
  it('publishes the library, keeps the storage reserve and returns the rest', async () => {
    const bc = await Blockchain.create()
    const cfg = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), bc.config)
    const prices = parseConfig18(cfg.get(18)!.toBoc().toString('base64'))
    const plan = planLibrary(order())
    const cost = publishCost(prices, plan)
    const payer = await bc.treasury('payer', { balance: toNano('1000') })
    const m = publishMessage(plan, cost.amount, false)
    expect(m.address.startsWith('Ef')).toBe(true)
    const r = await payer.send({ to: plan.address, value: m.amount, init: plan.init, bounce: true })
    const tx = r.transactions.find(t => t.inMessage?.info.dest?.toString() === plan.address.toString())!
    const d = tx.description
    expect(d.type === 'generic' && d.computePhase.type === 'vm' && d.computePhase.gasUsed).toBe(5652n) // same as the mainnet deploy
    const acc = (await bc.getContract(plan.address)).account.account!
    expect(acc.storage.state.type).toBe('active')
    const st = acc.storage.state.type === 'active' ? acc.storage.state.state : null
    expect(st!.code!.bits.length + st!.code!.refs.length).toBe(0) // bricked
    const lib = st!.libraries!.get(BigInt(`0x${plan.hash}`))!
    expect(lib.public).toBe(true)
    expect(lib.root.equals(plan.library)).toBe(true)
    // Kept: GETSTORAGEFEE (10 years, = our storage) + the gas of compute_data_size; everything else came back.
    expect(acc.storage.balance.coins).toBeGreaterThanOrEqual(cost.storage)
    expect(acc.storage.balance.coins - cost.storage).toBeLessThan(toNano('0.05'))
  })
  it('reproduces the underfunded mainnet attempt: the reserve fails and the value bounces', async () => {
    const bc = await Blockchain.create()
    const plan = planLibrary(order())
    const payer = await bc.treasury('payer', { balance: toNano('1000') })
    const r = await payer.send({ to: plan.address, value: toNano('1'), init: plan.init, bounce: true })
    const tx = r.transactions.find(t => t.inMessage?.info.dest?.toString() === plan.address.toString())!
    expect(tx.totalFees.coins).toBe(MAINNET_FEES)
    const back = [...tx.outMessages.values()][0]!
    expect(back.info.type === 'internal' && back.info.value.coins).toBe(MAINNET_BOUNCED)
    const acc = (await bc.getContract(plan.address)).account.account!
    expect(acc.storage.state.type === 'active' && acc.storage.state.state.libraries).toBeFalsy()
  })
})
