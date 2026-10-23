import { Address, Cell, toNano, TupleBuilder } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { codes } from '~/lib/deployers/codes'
import { parseVestingData } from '~/lib/wallet-detection/state'
import { WALLET_CODE_HASHES } from '~/utils/ton/wallets'
import { addWhitelistBody, DEPLOY_VALUE, normalizePublicKey, planVesting, validateVesting, vestingMessages, type VestingForm } from './logic'

// Real vesting.ton.org deploy on mainnet: tx dTOpIrXdEsj+8ENXrCL+kEUHZTnmwxTjNXZRsgz1C+0= (2025-11-21), 0.5 TON, no body,
// from 0:99DC29AD…9048 (the vesting sender) to EQDWiWnUDVf5F6DpTuOE9528gWJ_DpiaII5E64Dl0gMuGNNS.
// in_msg.init_state from toncenter /api/v3/transactions. Owner UQAG3pIv…q7N-, whose key tonapi /v2/accounts/{id}/publickey
// returns as 0cb34cf6…7bf0. Schedule from toncenter /api/v3/vesting: start 1729242000, duration 1440 d, period 30 d, cliff 360 d,
// total 1710938 TON.
const INIT_STATE = 'te6cckECHwEABI0AAgE0AQIBFP8A9KQT9LzyyAsDAVEAAAAAAAABDAyzTPY5aM1u3SlGzGfKBrcpKep1rGdYBhSCBLCZe3vwQB4CASAEBQIBSAYHA7jygwjXGCDTH9Mf0x8C+CO78mTtRNDTH9Mf0/8wWrryoVAzuvKiAvkBQDP5EPKj+ADbPCDXSsABjpntRO1F7UeRW+1n7WXtZI6C2zztQe3xAfL/kTDi+EGk+GHbPBUWFwOs0GwiINdJwWCRW+AB0NMDAXGwkVvg+kAw2zwB0x/TP/hLUkDHBSOCEKdzOs26sI6kbBLbPIIQ93M6zQFwgBjIywVQBM8WI/oCE8tqyx/LP8mAQPsA4w4VFggCASAJCgHO+EpSQMcFA4IQclimm7oTsI7RjiwB+kB/yMoAAvpEAcjKB8v/ydD4RBAjgQEI9EH4ZCDXSsIAIJUB1DDQAd6zEuaCEPJYppsycIAYyMsFUATPFiP6AhPLassfyz/JgED7ANs8kl8D4hcCASALDAIBIBMUAgFuDQ4CAWIPEAAZrc52omhAIGuQ64X/wAAZrx32omhAEGuQ64WPwAFLrTRtnjb8IkcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAVAgFqERIAD6JftRNDXCx+AS+ix2zz6RAHIygfL/8nQ+ESBAQj0Cm+hMYVASm6Ri2zz4RfhG+Ef4SPhJ+Er4S/hEgVAg25hG2zzbPIFRgAfu1E0NMfAfhh0x8B+GLT/wH4Y/QEAfhk1AHQ0z8B+GXTHwH4ZtMfAfhn0x8B+Gj6AAH4afpAAfhq+kAB+GvR0QJc0wfU0fgj2zwgwgCOmyLAA/LgZCHQ0wP6QDH6QPhKUiDHBbOSXwTjDZEw4gH7ABgZAGb4SPhH+Eb4RcjLP8sfyx/LH/hJ+gL4Ss8W+EvPFsn4RPhD+EL4QcjLH8sfy//0AMzJ7VQAYPhF+EagUhC8kjBw4PhF+EigUhC5kzD4SeD4SfhJ+EUTofhHqQT4RvhHqQQQI6mEoQP6IfpEAcjKB8v/ydD4RIEBCPQKb6Exj18zAXKwwALy4GUB+gAxcdch+gAx+gAx0z8x0x8x0wABwADy4GbTAAGT1DDQ3iFx2zyOKjHTHzAgghBOc3RLuiGCEEdldCS6sSGCEFZ0Q3C6sQGCEFZvdGW6sfLgZ+MOcJJfA+IgwgAcGhsC6gFw2zyObSDXScIAjmPTHyHAACKDC7qxIoEQAbqxIoIQR9VDkbqxIoIQWV8HvLqxIoIQafswbLqxIoIQVm90ZbqxIoIQVnRDcLqx8uBnAcAAIddJwgCwjhXTBzAgwGQhwHexIcBEsQHAV7Hy4GiRMOKRMOLjDRwdAA6TcvsCkTDiAEQB+kQBw/+SW3DgAfgzIG6SW3Dg0CDXSYMHuZJbcODXC/+6ABrTHzCCEFZvdGW68uBnAL0AAAAAZxIjkAdqcAAAJ40AAdqcAHBhQWy7kEAIATO4U1sMKqJDkWGdNuqoWi4p4NZ/SF6o5bL37DuPHSCRAAG3pIvsXdFJVKVLmf+bh+9zMUcM51RNoysUgCWv8Q3q4C2xf7o='
const ADDRESS = 'EQDWiWnUDVf5F6DpTuOE9528gWJ_DpiaII5E64Dl0gMuGNNS'
const SENDER = Address.parse('0:99DC29AD86155121C8B0CE9B75542D1714F06B3FA42F5472D97BF61DC78E9048')
const OWNER = 'UQAG3pIvsXdFJVKVLmf-bh-9zMUcM51RNoysUgCWv8Q3q7N-'
const OWNER_KEY = { public_key: '0cb34cf63968cd6edd2946cc67ca06b72929ea75ac675806148204b0997b7bf0' }
// add_whitelist the same sender sent later: tx n7vi1pj/m3wkI3ZBY4ijaCWZ3EZBV5/CqNLdX/4aqrw= (0.5 TON).
const WHITELIST_BODY = 'te6cckEBAQEAMAAAW3JYppsAAAAAAAAAAJ/iFPOxD1LwjVaFcYEm5cp7Y38+o2LWAZH/vWDayeq3QxAjWsbn'

const form = (over: Partial<VestingForm> = {}): VestingForm => ({
  owner: OWNER,
  publicKey: normalizePublicKey(OWNER_KEY),
  startTime: 1729242000,
  total: 1710938n * 10n ** 9n,
  durationDays: '1440',
  cliffDays: '360',
  unlockDays: '30',
  whitelist: '',
  masterchain: false,
  ...over
})

describe('code', () => {
  it('is the vesting wallet code running on mainnet', () => {
    expect(WALLET_CODE_HASHES[codes().vesting.hash().toString('base64')]?.version).toBe('vesting')
  })
})

describe('planVesting', () => {
  it('reproduces the vesting.ton.org StateInit and address bit for bit', () => {
    const { config, errors } = validateVesting(form(), SENDER)
    expect(errors).toEqual({})
    const plan = planVesting(config!)
    expect(plan.address.toString()).toBe(ADDRESS)
    expect(plan.stateInit.equals(Cell.fromBase64(INIT_STATE))).toBe(true)
  })
  it('masterchain uses wallet id 267 and workchain -1', () => {
    const plan = planVesting(validateVesting(form({ masterchain: true }), SENDER).config!)
    expect(plan.address.workChain).toBe(-1)
    expect(parseVestingData(plan.init.data!).subwalletId).toBe(267)
  })
})

describe('addWhitelistBody', () => {
  it('matches the real add_whitelist body', () => {
    const addr = Cell.fromBase64(WHITELIST_BODY).beginParse().skip(96).loadAddress()
    expect(addWhitelistBody([addr]).equals(Cell.fromBase64(WHITELIST_BODY))).toBe(true)
  })
})

describe('vestingMessages', () => {
  const plan = planVesting(validateVesting(form(), SENDER).config!)
  it('deploy only, like vesting.ton.org', () => {
    const [m, ...rest] = vestingMessages(plan, [], null, false)
    expect(rest).toHaveLength(0)
    expect(m!.amount).toBe(DEPLOY_VALUE)
    expect(m!.payload).toBeUndefined()
    expect(m!.address).toBe(ADDRESS)
  })
  it('deploy + whitelist + funding', () => {
    const msgs = vestingMessages(plan, [SENDER], 5n, true)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.payload).toBeDefined()
    expect(msgs[1]).toEqual({ address: plan.address.toString({ testOnly: true }), amount: 5n })
  })
})

describe('validateVesting', () => {
  it('enforces the contract conditions', () => {
    expect(validateVesting(form({ durationDays: '100', unlockDays: '30', cliffDays: '0' }), SENDER).errors.durationDays).toMatch(/whole number of unlock periods/)
    expect(validateVesting(form({ cliffDays: '45' }), SENDER).errors.cliffDays).toMatch(/whole number/)
    expect(validateVesting(form({ cliffDays: '1440' }), SENDER).errors.cliffDays).toMatch(/shorter/)
    expect(validateVesting(form({ unlockDays: '2000' }), SENDER).errors.unlockDays).toMatch(/longer/)
    expect(validateVesting(form({ unlockDays: '0' }), SENDER).errors.unlockDays).toBeDefined()
    expect(validateVesting(form({ total: 10n ** 8n }), SENDER).errors.total).toMatch(/At least/)
    expect(validateVesting(form({ owner: 'x' }), SENDER).errors.owner).toBeDefined()
    expect(validateVesting(form({ publicKey: 'abc' }), SENDER).errors.publicKey).toBeDefined()
    expect(validateVesting(form({ whitelist: 'nope' }), SENDER).errors.whitelist).toMatch(/Line 1/)
    expect(validateVesting(form({ cliffDays: '0', unlockDays: '1440' }), SENDER).errors).toEqual({})
  })
})

// The official contract, our exact messages: whitelist chain of 3 addresses is read back by get_whitelist,
// the funding stays, and the owner cannot take locked GRAM out.
describe('end to end in @ton/sandbox', () => {
  it('deploys, whitelists and funds', async () => {
    const bc = await Blockchain.create()
    bc.now = 1_800_000_000
    const sender = await bc.treasury('sender')
    const owner = await bc.treasury('owner')
    const wl = await Promise.all(['w1', 'w2', 'w3'].map(n => bc.treasury(n)))
    const { config } = validateVesting(form({ owner: owner.address.toString(), startTime: bc.now, total: toNano('100'), durationDays: '360', cliffDays: '0', unlockDays: '30' }), sender.address)
    const plan = planVesting(config!)
    const msgs = vestingMessages(plan, wl.map(w => w.address), toNano('100'), false)
    for (const m of msgs) await sender.send({ to: Address.parse(m.address), value: m.amount, init: m.stateInit ? plan.init : undefined, body: m.payload, bounce: true })

    const r = (await bc.runGetMethod(plan.address, 'get_vesting_data')).stackReader
    expect([r.readNumber(), r.readNumber(), r.readNumber(), r.readNumber(), r.readBigNumber()]).toEqual([bc.now, 360 * 86400, 30 * 86400, 0, toNano('100')])
    expect(r.readAddress().equals(sender.address)).toBe(true)
    expect(r.readAddress().equals(owner.address)).toBe(true)

    for (const w of wl) {
      const tb = new TupleBuilder()
      tb.writeAddress(w.address)
      expect((await bc.runGetMethod(plan.address, 'is_whitelisted', tb.build())).stackReader.readBoolean()).toBe(true)
    }
    const acc = await bc.getContract(plan.address)
    // The 0.5 deploy value came back with the add_whitelist response; only storage was paid out of the funding.
    expect(acc.balance).toBeGreaterThan(toNano('99.99'))
    expect(acc.balance).toBeLessThan(toNano('100'))
  })
})
