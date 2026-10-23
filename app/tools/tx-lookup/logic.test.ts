// Real mainnet traces from toncenter v3 /traces (app/lib/tx-user/fixtures, saved 2026-10-22).
import { describe, expect, it } from 'vitest'
import failed from '~/lib/tx-user/fixtures/toncenter-trace-failed.json'
import usdt from '~/lib/tx-user/fixtures/toncenter-trace-usdt.json'
import comment from '~/lib/tx-user/fixtures/toncenter-trace-comment.json'
import type { TcTracesResponse } from './logic'
import { interfaceLabel, stepCount, summarizeTrace } from './logic'

describe('summarizeTrace', () => {
  it('failed USD₮ transfer to STON.fi: jetton wallet exits with 47 and bounces', () => {
    const s = summarizeTrace(failed as unknown as TcTracesResponse)!
    expect(s.status).toBe('partial')
    expect(s.txCount).toBe(3)
    // toncenter total_fees of the three transactions: 478503 + 88891 + 44601
    expect(s.totalFees).toBe(611995n)
    expect(s.rootTxHex).toBe('b492e6f67440fc27201ae61900149107ada38869bfe3a85e0528e9686da3d2ca')
    expect(s.failures).toHaveLength(1)
    const f = s.failures[0]!
    expect(f.compute?.code).toBe(47)
    expect(f.compute?.title).toMatch(/Not enough jettons/)
    expect(f.opName).toBe('jetton transfer')
    expect(f.bounces).toBe(true)
    expect(s.root.inKind).toBe('external')
    expect(s.root.children[0]!.children[0]!.bouncedIn).toBe(true)
  })

  it('successful USD₮ transfer: 5 transactions, all ok', () => {
    const s = summarizeTrace(usdt as unknown as TcTracesResponse)!
    expect(s.status).toBe('success')
    expect(s.txCount).toBe(5)
    expect(stepCount(s.root)).toBe(5)
    expect(s.failures).toEqual([])
    expect(s.root.accountFriendly).toBe('UQD_6ogbrUGlsbYPF_a6Vwkahpmc9_CRtW6RSVQ8GR0gIR-I')
  })

  it('plain transfer with comment', () => {
    const s = summarizeTrace(comment as unknown as TcTracesResponse)!
    expect(s.status).toBe('success')
    expect(s.totalFees).toBe(350758n + 6668n)
    const recv = s.root.children[0]!
    expect(recv.value).toBe(500000000n)
    expect(recv.comment).toBe('player-11')
  })

  it('empty response', () => {
    expect(summarizeTrace({ traces: [], address_book: {} })).toBeNull()
  })

  it('interface labels', () => {
    expect(interfaceLabel(['jetton_wallet_governed'])).toBe('Jetton wallet governed')
    expect(interfaceLabel([])).toBe('')
  })
})
