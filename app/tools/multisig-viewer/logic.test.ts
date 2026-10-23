import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import fixture from './fixture.json'
import type { SendAction } from './logic'
import { approvals, decodeOrder, jettonMetaByWallet, jettonWalletsIn, orderStatus, roleOf } from './logic'

// Live multisig v2 0:F2A2E706…4317 (fixture.json, toncenter v3, 2026-10-22). Our decoder reads order_boc itself;
// the expected values are toncenter's own parse_actions output for the same orders (independent parser).
const order = (seqno: string) => fixture.orders.find(o => o.order_seqno === seqno)!

describe('decodeOrder', () => {
  it.each(fixture.orders.map(o => [o.order_seqno, o] as const))('order %s matches toncenter parse_actions', (_, o) => {
    const ours = decodeOrder(o.order_boc!)
    expect(ours).toHaveLength(o.actions!.length)
    o.actions!.forEach((tc, i) => {
      const a = ours[i] as SendAction
      expect(a.kind).toBe('send')
      expect(a.destination).toBe(tc.destination)
      expect(a.value).toBe(BigInt(tc.value))
      expect(a.mode).toBe(tc.send_mode)
      if (tc.parsed_body_type === 'jetton_transfer') {
        const pb = tc.parsed_body as { amount: string, destination: string, response: string, forward_amount: string }
        expect(a.body?.name).toBe('jetton_transfer')
        expect(a.body?.fields.amount).toBe(BigInt(pb.amount))
        expect(Address.parse(a.body?.fields.destination as string).equals(Address.parse(pb.destination))).toBe(true)
        expect(Address.parse(a.body?.fields.response_destination as string).equals(Address.parse(pb.response))).toBe(true)
        expect(a.body?.fields.forward_ton_amount).toBe(BigInt(pb.forward_amount))
      }
      else {
        // ton_transfer with empty comment: no body or an empty text comment
        expect(tc.parsed_body_type).toBe('ton_transfer')
        expect(a.body === null || a.body.name === 'text_comment').toBe(true)
      }
    })
  })
  it('rejects garbage', () => {
    expect(() => decodeOrder('hello')).toThrow()
  })
})

describe('order state', () => {
  it('status from sent_for_execution and expiration_date', () => {
    expect(orderStatus(order('64'))).toBe('executed')
    expect(orderStatus(order('62'))).toBe('expired') // toncenter: sent_for_execution false, expired 2025
    expect(orderStatus({ sent_for_execution: false, expiration_date: 2000 }, 1000)).toBe('pending')
  })
  it('approvals_mask bits map to signer indexes and agree with approvals_num', () => {
    for (const o of fixture.orders) {
      expect(approvals(o.approvals_mask, o.signers).filter(x => x.approved)).toHaveLength(o.approvals_num)
    }
    // mask 56 = signers 3, 4, 5
    expect(approvals('56', order('1743669632').signers).map(x => x.approved)).toEqual([false, false, false, true, true, true])
  })
  it('role of a wallet', () => {
    expect(roleOf(fixture.multisig, '0:84e665dc2c93a7ba96e667a295af6bc8d66eeb649aa31551445ae39bc08ad625')).toBe('signer')
    expect(roleOf(fixture.multisig, fixture.multisig.address)).toBeNull()
  })
})

describe('jetton metadata', () => {
  it('resolves the multisig jetton wallet to USD₮ with 6 decimals', () => {
    const meta = jettonMetaByWallet(fixture.jettonWallets)
    const wallets = jettonWalletsIn(decodeOrder(order('64').order_boc!))
    expect(wallets).toEqual(['0:8DC8908F18ECBFF78A00C348097CD9AD30CD5113046FC2310108BBF8A12FA8B6'])
    expect(meta.get(wallets[0]!)).toMatchObject({ symbol: 'USD₮', decimals: 6, master: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE' })
  })
})
