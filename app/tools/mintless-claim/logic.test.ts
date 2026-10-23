import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { HMSTR_CLAIM, HMSTR_MASTER, HMSTR_MERKLE_ROOT } from '~/lib/jettons-dev/fixtures'
import { jettonTransferBody } from '~/utils/ton/messages'
import { checkClaim, claimMessage, claimWindow, CLAIM_ATTACH_NANO, customPayloadOf } from './logic'

// Vector: a real HMSTR claim on mainnet, tx qzUWwinTZ+8A1pHaVI+mkTOzTKiA7Bx4MdYPYnx45z8= (toncenter v3 /transactions),
// plus the minter's get_mintless_airdrop_hashmap_root (toncenter v2 runGetMethod), 2026-10-22.
const body = Cell.fromBase64(HMSTR_CLAIM.body)
const s = body.beginParse()
s.skip(32 + 64)
s.loadCoins()
s.loadAddress()
s.loadAddress()
const customPayload = s.loadMaybeRef()!
s.loadCoins()
s.loadBit()
const forwardRef = s.loadRef()

const owner = Address.parse(HMSTR_CLAIM.owner)
const master = Address.parse(HMSTR_MASTER)
const base = { customPayload: customPayload.toBoc().toString('base64'), stateInit: HMSTR_CLAIM.stateInit, owner, master }

describe('checkClaim on a real HMSTR claim', () => {
  it('finds the owner entry, roots match the wallet and the minter, wallet address matches the chain', () => {
    // minterWallet: HMSTR minter get_wallet_address(owner) via toncenter v3 runGetMethod, 2026-10-23.
    const c = checkClaim({ ...base, minterRoot: HMSTR_MERKLE_ROOT, minterWallet: Address.parse(HMSTR_CLAIM.jettonWallet), now: 1727400012 })
    expect(c.problems).toEqual([])
    expect(c.wallet.address.toRawString().toUpperCase()).toBe(HMSTR_CLAIM.jettonWallet)
    expect(c.wallet.merkleRoot).toBe(HMSTR_MERKLE_ROOT)
    expect(c.wallet.codeIsLibrary).toBe(true)
    expect(c.item.amount).toBeGreaterThanOrEqual(HMSTR_CLAIM.amount) // the owner sent part of the airdrop in the same tx
    expect(c.window).toBe('open') // it was claimed at that time on chain
  })

  it('accepts hex BOCs (tonapi) and flags a wrong owner / wrong minter root', () => {
    const hex = { ...base, customPayload: customPayload.toBoc().toString('hex') }
    expect(() => checkClaim({ ...hex, owner: Address.parse(HMSTR_CLAIM.destination) })).toThrow(/does not contain an entry/)
    expect(checkClaim({ ...hex, minterRoot: '00'.repeat(32) }).problems.join()).toMatch(/minter/)
    expect(checkClaim({ ...hex, master: owner }).problems.join()).toMatch(/different jetton/)
    expect(checkClaim({ ...hex, minterWallet: owner }).problems.join()).toMatch(/minter says your jetton wallet/)
    expect(checkClaim({ ...hex, minterWallet: null }).problems.join()).toMatch(/did not confirm/)
  })

  it('customPayloadOf extracts the same payload from the real body', () => {
    expect(customPayloadOf(HMSTR_CLAIM.body).equals(customPayload)).toBe(true)
    expect(() => customPayloadOf(forwardRef.toBoc().toString('base64'))).toThrow(/jetton_transfer/)
  })

  it('claimWindow', () => {
    const item = { amount: 1n, startFrom: 100, expireAt: 200 }
    expect([claimWindow(item, 99), claimWindow(item, 100), claimWindow(item, 200), claimWindow(item, 201)]).toEqual(['not-started', 'open', 'open', 'expired'])
  })
})

describe('claim message', () => {
  it('the shared jetton_transfer builder with this custom_payload reproduces the on-chain claim body exactly', () => {
    const rebuilt = jettonTransferBody({
      queryId: HMSTR_CLAIM.queryId, amount: HMSTR_CLAIM.amount, destination: Address.parse(HMSTR_CLAIM.destination),
      responseDestination: owner, customPayload, forwardTonAmount: HMSTR_CLAIM.forwardTonAmount, forwardPayload: forwardRef
    })
    expect(rebuilt.hash().toString('hex')).toBe(body.hash().toString('hex'))
  })

  it('claim-only message: 0 jettons to yourself, to your jetton wallet, state_init only when not deployed', () => {
    const c = checkClaim(base)
    const m = claimMessage(c, owner, { deployed: false })
    expect(Address.parse(m.address).equals(Address.parse(HMSTR_CLAIM.jettonWallet))).toBe(true)
    expect(m.amount).toBe(CLAIM_ATTACH_NANO)
    expect((m.stateInit as Cell).equals(Cell.fromBase64(HMSTR_CLAIM.stateInit))).toBe(true)
    const p = (m.payload as Cell).beginParse()
    expect(p.loadUint(32)).toBe(0x0f8a7ea5)
    p.loadUintBig(64)
    expect(p.loadCoins()).toBe(0n)
    expect(p.loadAddress().equals(owner)).toBe(true)
    expect(p.loadAddress().equals(owner)).toBe(true)
    expect(p.loadMaybeRef()!.equals(customPayload)).toBe(true)
    expect(claimMessage(c, owner, { deployed: true }).stateInit).toBeUndefined()
  })
})
