import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { StakingPool, WhalesParams } from '~/lib/staking/pools'
import { buildPlan, TF_DEPOSIT_FEE, TONSTAKERS_STAKE_RESERVE, TONSTAKERS_UNSTAKE_VALUE, tonstakersDepositBody, tonstakersUnstakeBody, whalesDepositBody, whalesWithdrawBody } from './logic'
import { commentBody } from '~/utils/ton/messages'

// Every expected body below is the in_msg body of a successful mainnet transaction (toncenter v3 /transactions, read 2026-10-22/23).
const boc = (b64: string) => Cell.fromBase64(b64)
const same = (a: Cell, b64: string) => expect(a.hash().toString('hex')).toBe(boc(b64).hash().toString('hex'))

describe('TON Whales bodies', () => {
  // tx 8QPXO89dRRaNrM9bGYCenuRttzlkKtu3spSGsHvR7Ds= : 1000 GRAM deposit into Tonkeeper Queue #1 (0:00ff9f…).
  it('deposit matches a real Tonkeeper Queue #1 deposit', () => {
    same(whalesDepositBody(6083770389682264482n), 'te6cckEBAQEAEgAAH3vNH+9UbeTvrA0ZojAYagidEAEY')
  })
  // tx jG7kG9Stda0VeZYD6qmngnJeJvR0tBfGXIgOaD8kRsQ= : withdraw request for 20 GRAM, 0.2 GRAM attached.
  it('withdraw matches a real 20 GRAM withdraw request', () => {
    same(whalesWithdrawBody(6083770390427343614n, 20_000_000_000n), 'te6cckEBAQEAFwAAKtqAPv1UbeTv2HYa/jAYagUEqBfIAEvr4yM=')
  })
})

describe('Tonstakers bodies', () => {
  // tx tmAvXMMS0VopT2nkJMHXEIG8LZOUtdNwoehoKO56Dc0= : 1075 GRAM deposit into the Tonstakers pool (0:a45b17…), no partner code.
  it('deposit matches a real deposit', () => {
    same(tonstakersDepositBody(), 'te6cckEBAQEADgAAGEfVQ5EAAAAAAAAAAepC7aY=')
  })
  // tx 7BWki6odDAF0oxODFdFRZMfjKTGEwWy0NmrK5HWJSkc= : burn of 71.917231432 tsTON, wait till round end (bits 1,0), 1.05 GRAM attached.
  it('unstake (wait for round end) matches a real burn', () => {
    const owner = Address.parseRaw('0:7978A72A40A1C513C925273632077FDB53915CBEC7FD25DBFC441500B87ECC5B')
    same(tonstakersUnstakeBody({ amount: 71917231432n, owner, mode: 'round' }), 'te6cckEBAgEAOQABZllfB7wAAAAAAAAAAFEL6Z3UiADy8U5UgUOKJ5JKTmxkDv+2pyK5fY/6S7f4iCoBcP2YtwEAAaBt45Mr')
  })
  // tx tD8hvM2pUbtRmGt5avK9mHZQsFDblycCL0oY2h0v7Ik= : instant-only burn of 85.395479155 tsTON (bits 0,1).
  it('unstake (instant only) matches a real burn', () => {
    const owner = Address.parseRaw('0:D8DFD9933EC9E0EDD3F0C379C5ACDBA951C6BF3A19EC89D0E97FCF4FBD57AD45')
    same(tonstakersUnstakeBody({ amount: 85395479155n, owner, mode: 'instant' }), 'te6cckEBAgEAOQABZllfB7wAAAAAAAAAAFE+H3mnOAGxv7MmfZPB26fhhvOLWbdSo41+dDPZE6HS/56feq9aiwEAAWA0olya')
  })
  it('auto mode stores two zero bits', () => {
    const owner = Address.parseRaw('0:D8DFD9933EC9E0EDD3F0C379C5ACDBA951C6BF3A19EC89D0E97FCF4FBD57AD45')
    const flags = tonstakersUnstakeBody({ amount: 1n, owner, mode: 'auto' }).refs[0]!
    expect(flags.bits.length).toBe(2)
    expect(flags.beginParse().loadUint(2)).toBe(0)
  })
})

describe('TON Core nominator pool comments', () => {
  // txs mVIytAY+fSQLuCBT8wyBBj1plP2A2yFCV1hcsd8DwTc= ("d", 7000 GRAM) and YKFSdMB0CA/5eC6VzMAZ/lHl/GDUnZLpDMjEPYaZGaA= ("w", 1 GRAM).
  it('uses the real "d" and "w" bodies', () => {
    same(commentBody('d'), 'te6cckEBAQEABwAACgAAAABkSdX8Kw==')
    same(commentBody('w'), 'te6cckEBAQEABwAACgAAAAB30uHyKA==')
  })
})

const TONSTAKERS = { address: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa', name: 'Tonstakers', implementation: 'liquidTF', min_stake: 1000000000, max_nominators: -1, current_nominators: 144302 } as StakingPool
const WHALES = { address: '0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a', name: 'Tonkeeper Queue #1', implementation: 'whales', min_stake: 50000000000, max_nominators: 30000, current_nominators: 3967 } as StakingPool
const TF = { address: '-1:1189458eea400d0c5', name: 'HB Pool #1', implementation: 'tf', min_stake: 10001000000000, max_nominators: 40, current_nominators: 4 } as StakingPool
// Live get_params of Tonkeeper Queue #1 (see app/lib/staking/pools.test.ts).
const PARAMS: WhalesParams = { enabled: true, minStake: 49800000000n, depositFee: 100000000n, withdrawFee: 100000000n, poolFee: 2500n, receiptPrice: 100000000n }
const G = 1_000_000_000n

describe('buildPlan', () => {
  it('Tonstakers stake attaches the 1 GRAM reserve', () => {
    const p = buildPlan({ kind: 'liquidTF', action: 'stake', pool: TONSTAKERS, amount: 10n * G })
    expect(p.messages).toHaveLength(1)
    expect(p.messages[0]!.address).toBe(TONSTAKERS.address)
    expect(p.messages[0]!.amount).toBe(10n * G + TONSTAKERS_STAKE_RESERVE)
    expect(buildPlan({ kind: 'liquidTF', action: 'stake', pool: TONSTAKERS, amount: G / 2n }).problem).toMatch(/minimum/)
  })
  it('Tonstakers unstake goes to the jetton wallet with 1.05 GRAM', () => {
    const owner = Address.parseRaw('0:7978A72A40A1C513C925273632077FDB53915CBEC7FD25DBFC441500B87ECC5B')
    const base = { kind: 'liquidTF' as const, action: 'unstake' as const, pool: TONSTAKERS, owner, jettonWallet: '0:78ADD0890EAFF3F27A62E6402528DA196346EECFD951623D665927CD8DB0B1E8', jettonBalance: 100n * G }
    const p = buildPlan({ ...base, amount: 71917231432n, mode: 'round' })
    expect(p.messages[0]!.address).toBe(base.jettonWallet)
    expect(p.messages[0]!.amount).toBe(TONSTAKERS_UNSTAKE_VALUE)
    expect(buildPlan({ ...base, amount: 101n * G }).problem).toMatch(/more tsTON/)
    expect(buildPlan({ ...base, owner: null, amount: G }).problem).toMatch(/Connect/)
    expect(buildPlan({ ...base, jettonBalance: 0n, jettonWallet: null, amount: G }).problem).toMatch(/no tsTON/)
  })
  it('Whales stake adds deposit + receipt fee; withdraw attaches exactly 0.2 GRAM', () => {
    const s = buildPlan({ kind: 'whales', action: 'stake', pool: WHALES, amount: 100n * G, whales: PARAMS, queryId: 1n })
    expect(s.messages[0]!.amount).toBe(100n * G + 200_000_000n)
    expect(buildPlan({ kind: 'whales', action: 'stake', pool: WHALES, amount: 49n * G, whales: PARAMS }).problem).toMatch(/minimum/)
    const w = buildPlan({ kind: 'whales', action: 'unstake', pool: WHALES, amount: null, withdrawAll: true, whales: PARAMS, queryId: 5n })
    expect(w.messages[0]!.amount).toBe(200_000_000n)
    const body = (w.messages[0]!.payload as Cell).beginParse()
    expect(body.loadUint(32)).toBe(0xda803efd)
    expect(body.loadUintBig(64)).toBe(5n)
    expect(body.loadCoins()).toBe(100000n)
    expect(body.loadCoins()).toBe(0n) // 0 = withdraw everything
    expect(buildPlan({ kind: 'whales', action: 'unstake', pool: WHALES, amount: null, withdrawAll: true, whales: PARAMS, noPosition: true }).problem).toMatch(/no stake/)
  })
  it('TF pool: "d" with the 1 GRAM fee on top, "w" with 1 GRAM', () => {
    const s = buildPlan({ kind: 'tf', action: 'stake', pool: TF, amount: 10000n * G })
    expect(s.messages[0]!.amount).toBe(10000n * G + TF_DEPOSIT_FEE)
    expect(buildPlan({ kind: 'tf', action: 'stake', pool: TF, amount: 9999n * G }).problem).toMatch(/minimum/)
    expect(buildPlan({ kind: 'tf', action: 'stake', pool: TF, amount: 5n * G, staked: 20000n * G }).problem).toBeUndefined()
    expect(buildPlan({ kind: 'tf', action: 'stake', pool: { ...TF, current_nominators: 40 }, amount: 20000n * G }).problem).toMatch(/full/)
    const w = buildPlan({ kind: 'tf', action: 'unstake', pool: TF, amount: null })
    expect(w.messages[0]!.amount).toBe(G)
    expect(buildPlan({ kind: 'tf', action: 'unstake', pool: TF, amount: null, noPosition: true }).messages).toHaveLength(0)
  })
})
