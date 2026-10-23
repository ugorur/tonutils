import { describe, expect, it } from 'vitest'
import { USDT_MASTER } from '~/utils/ton/jetton'
import fixture from './fragment-events.json'
import type { TonapiEvent } from './logic'
import { difference, exampleFromEvents, findPayments, invoiceState, mergeEvents, receiptRows, specFor } from './logic'

// Real events: GET https://tonapi.io/v2/accounts/0:852443f8…283a/events?limit=30 (Fragment), fetched 2026-10-23; friendly form from toncenter detectAddress,
// trimmed to the fields we read. Includes an in-progress event, a batch of 3 USD₮ transfers in one event
// (d4223b32…) and an event with two coin transfers (65a156f8…).
const events = fixture as unknown as TonapiEvent[]
const FRAGMENT = 'EQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2'
const FRAGMENT_RAW = '0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a'

describe('findPayments on real tonapi events', () => {
  it('matches a coin payment by comment (any address form)', () => {
    for (const to of [FRAGMENT, FRAGMENT_RAW]) {
      const p = findPayments(events, { to, text: '1000 Telegram Stars \n\nRef#SFWLreoc7' })
      expect(p).toHaveLength(1)
      expect(p[0]).toMatchObject({ eventId: '992b303783f71fc805b0dc3080e28f9df8dcc382e3f6b97ea746b5d218104c8d', amount: 11_344_700_000n, inProgress: false, timestamp: 1792738948 })
      expect(p[0]!.sender).toBe('0:28bd1070a9f91a5f54624957c5f734ce4ee40b6e0361712a56bcc0e0a0d8c613')
    }
  })
  it('finds one action inside a batched jetton event, only for the right jetton', () => {
    const p = findPayments(events, { to: FRAGMENT, jetton: USDT_MASTER, text: '250 Telegram Stars \n\nRef#IQZvs3Oqr' })
    expect(p.map(x => x.amount)).toEqual([3_750_000n])
    // Same comment as a coin invoice: not a coin transfer.
    expect(findPayments(events, { to: FRAGMENT, text: '250 Telegram Stars \n\nRef#IQZvs3Oqr' })).toEqual([])
    // Other jetton master: no match.
    expect(findPayments(events, { to: FRAGMENT, jetton: FRAGMENT, text: '250 Telegram Stars \n\nRef#IQZvs3Oqr' })).toEqual([])
  })
  it('without a comment, only exact amounts count', () => {
    const p = findPayments(events, { to: FRAGMENT, amount: 1_702_300_000n })
    expect(p.map(x => x.comment)).toEqual(['150 Telegram Stars \n\nRef#4mUPgGtbt'])
    expect(findPayments(events, { to: FRAGMENT })).toEqual([])
  })
  it('respects since and the recipient', () => {
    expect(findPayments(events, { to: FRAGMENT, text: '1000 Telegram Stars \n\nRef#SFWLreoc7', since: 1792738949 })).toEqual([])
    const other = '0:28bd1070a9f91a5f54624957c5f734ce4ee40b6e0361712a56bcc0e0a0d8c613'
    expect(findPayments(events, { to: other, text: '1000 Telegram Stars \n\nRef#SFWLreoc7' })).toEqual([])
  })
})

describe('invoice state', () => {
  const spec = (text: string, amount?: bigint) => ({ to: FRAGMENT, text, amount })
  it('paid / overpaid / underpaid / waiting', () => {
    const pay = findPayments(events, spec('50 Telegram Stars \n\nRef#hz4A586KX'))
    expect(invoiceState(pay, 567_200_000n).status).toBe('paid')
    expect(invoiceState(pay, 500_000_000n).status).toBe('overpaid')
    const under = invoiceState(pay, 600_000_000n)
    expect(under.status).toBe('underpaid')
    expect(difference(under, 600_000_000n)).toBe(-32_800_000n)
    expect(invoiceState(pay).status).toBe('paid') // no amount: any payment with the comment settles it
    expect(invoiceState([], 1n).status).toBe('waiting')
    expect(difference(invoiceState([], 1n), 1n)).toBeNull()
  })
  it('an in-progress trace is pending', () => {
    const p = findPayments(events, spec('50 Telegram Stars \n\nRef#XaV9a9Ylw'))
    expect(invoiceState(p, 567_200_000n).status).toBe('pending')
  })
})

describe('helpers', () => {
  it('mergeEvents de-duplicates overlapping polls, newest lt first', () => {
    const m = mergeEvents(events.slice(0, 4), events.slice(2))
    expect(m).toHaveLength(events.length)
    expect(m[0]!.lt).toBe(111805420000019)
  })
  it('specFor needs a comment or an amount, and no binary body', () => {
    expect(specFor({ to: FRAGMENT })).toBeNull()
    expect(specFor({ to: FRAGMENT, amount: 1n, bin: 'te6' })).toBeNull()
    expect(specFor({ to: FRAGMENT, text: 'x' }, 5)).toEqual({ to: FRAGMENT, text: 'x', since: 5, amount: undefined, jetton: undefined })
  })
  it('example = newest completed commented coin transfer (skips the in-progress one)', () => {
    const ex = exampleFromEvents(events, FRAGMENT)!
    expect(ex.request).toEqual({ to: FRAGMENT, amount: 11_344_700_000n, text: '1000 Telegram Stars \n\nRef#SFWLreoc7' })
    expect(findPayments(events, specFor(ex.request, ex.since)!)).toHaveLength(1)
  })
  it('example skips outgoing transfers (a newer commented transfer sent by the account itself)', () => {
    const real = events.find(e => e.event_id.startsWith('992b3037'))!
    const t = real.actions.find(a => a.TonTransfer?.comment)!.TonTransfer!
    const outgoing = { ...real, event_id: 'out', lt: real.lt + 1, actions: [{ type: 'TonTransfer', status: 'ok', TonTransfer: { ...t, sender: t.recipient, recipient: t.sender, comment: 'refund' } }] }
    expect(exampleFromEvents([outgoing, ...events], FRAGMENT)!.request.text).toBe('1000 Telegram Stars \n\nRef#SFWLreoc7')
  })
  it('receipt rows', () => {
    const rows = receiptRows(findPayments(events, { to: FRAGMENT, text: '1000 Telegram Stars \n\nRef#SFWLreoc7' }), n => n.toString())
    expect(rows[0]).toMatchObject({ time: '2026-10-23T07:02:28.000Z', amount: '11344700000', status: 'final' })
  })
})
