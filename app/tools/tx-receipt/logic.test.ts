// Real mainnet events from tonapi.io; fee cross-checked with toncenter (app/lib/tx-user/fixtures, saved 2026-10-22).
import { describe, expect, it } from 'vitest'
import type { TaEvent } from '~/lib/tx-user/events'
import commentEvent from '~/lib/tx-user/fixtures/tonapi-event-comment.json'
import commentAccountEvent from '~/lib/tx-user/fixtures/tonapi-account-event-comment.json'
import commentTrace from '~/lib/tx-user/fixtures/toncenter-trace-comment.json'
import usdtEvent from '~/lib/tx-user/fixtures/tonapi-event-usdt.json'
import failedEvent from '~/lib/tx-user/fixtures/tonapi-event-failed.json'
import { buildReceipt, feeFromAccountEvent, receiptText, utcTime } from './logic'

describe('buildReceipt', () => {
  it('GRAM payment with comment (toncenter: 500000000 nano, comment "player-11")', () => {
    const r = buildReceipt(commentEvent as unknown as TaEvent)!
    expect(r.status).toBe('confirmed')
    expect(r.payer?.address).toBe('0:bc8ffdbd936d009a27e004aeb2fb54bf29ee4839c40b8870fafbbc08f5da6fbf')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]!.value?.amount).toBe(500000000n)
    expect(r.lines[0]!.view.comment).toBe('player-11')
    expect(r.lines[0]!.view.to?.address).toBe('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(utcTime(r.time)).toBe('2026-10-13 05:51:39 UTC') // toncenter start_utime 1791870699
  })

  it('payer fee = toncenter root total_fees + forward fee', () => {
    const root = Object.values(commentTrace.traces[0]!.transactions).find(t => !t.in_msg?.source)!
    expect(feeFromAccountEvent(commentAccountEvent as unknown as TaEvent, '0:bc8ffdbd936d009a27e004aeb2fb54bf29ee4839c40b8870fafbbc08f5da6fbf')).toBe(BigInt(root.total_fees) + BigInt(root.out_msgs[0]!.fwd_fee!))
  })

  it('USD₮ payment (toncenter jetton/transfers: 1792846, 6 decimals)', () => {
    const r = buildReceipt(usdtEvent as unknown as TaEvent)!
    expect(r.lines[0]!.value).toEqual({ asset: expect.objectContaining({ symbol: 'USD₮', decimals: 6 }), amount: 1792846n })
    const text = receiptText(r, { fee: 970932n, explorer: 'https://tonviewer.com/transaction/x', testOnly: false })
    expect(text).toContain('Amount: 1.792846 USD₮')
    expect(text).toContain('To: UQBNRk0gCO_voi7Q6fTpj2QF-GI2vqVQPFVEiGHgTUwX2aHK')
    expect(text).toContain('Network fee: 0.000970932 GRAM')
    // USD₮ master (tether.to / tonviewer): EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
    expect(text).toContain('Token contract: EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs\n')
  })

  it('failed transfer: refund to the payer is not a payment line', () => {
    const r = buildReceipt(failedEvent as unknown as TaEvent)!
    expect(r.status).toBe('failed')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]!.view.type).toBe('JettonTransfer')
    expect(r.lines[0]!.value?.amount).toBe(172717947n)
  })

  it('non-payment events give null', () => {
    expect(buildReceipt({ event_id: 'x', timestamp: 0, lt: 0, in_progress: false, actions: [{ type: 'ContractDeploy', status: 'ok', ContractDeploy: { address: '0:00', interfaces: [] } }] })).toBeNull()
  })
})
