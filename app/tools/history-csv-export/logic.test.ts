// Real mainnet events from tonapi.io (app/lib/tx-user/fixtures, saved 2026-10-22). Koinly header from the
// hledger project's Koinly custom CSV example; fees cross-checked with toncenter.
import { describe, expect, it } from 'vitest'
import type { TaEvent, TaEventsPage } from '~/lib/tx-user/events'
import type { RatePoint } from '~/lib/tx-user/rates'
import page from '~/lib/tx-user/fixtures/tonapi-account-events-swapper.json'
import chart from '~/lib/tx-user/fixtures/tonapi-rates-ton-usd-180d.json'
import commentEvent from '~/lib/tx-user/fixtures/tonapi-account-event-comment.json'
import commentTrace from '~/lib/tx-user/fixtures/toncenter-trace-comment.json'
import { KOINLY_COLUMNS, buildRows, columnsFor, dateBounds, eventRecord, presetRange, safeText, totals, utcMinute } from './logic'

const SWAPPER = 'UQA1oZvigoavK2fWe1imzZKmoAx6GlzHA0efVqJFNYJ6Mwtx'
const records = (page as unknown as TaEventsPage).events.map(e => eventRecord(e, SWAPPER))
const base = { network: 'mainnet' as const, includeFailed: true, hideSpam: true }

describe('eventRecord', () => {
  it('reconciles with the on-chain balance change: -(value + total_fees + fwd_fee)', () => {
    const r = eventRecord(commentEvent as unknown as TaEvent, '0:bc8ffdbd936d009a27e004aeb2fb54bf29ee4839c40b8870fafbbc08f5da6fbf')
    const root = Object.values(commentTrace.traces[0]!.transactions).find(t => !t.in_msg?.source)!
    const out = root.out_msgs[0]!
    const signed = r.movements.reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0n) - r.fee
    expect(signed).toBe(-(BigInt(out.value!) + BigInt(root.total_fees) + BigInt(out.fwd_fee!)))
  })
})

describe('failed transfer with bounce', () => {
  it('is a fee-only row: the bounced GRAM is netted, not income (toncenter net loss 768219 nano)', () => {
    const r = records.find(x => x.eventId.startsWith('b492e6f6'))!
    expect(r.movements).toEqual([])
    expect(r.fee).toBe(768219n)
    expect(buildRows([r], { ...base, format: 'koinly' })).toMatchObject([{ 'Fee Amount': '0.000768219', 'Received Amount': '' }])
  })
})

describe('Koinly universal format', () => {
  const rows = buildRows(records, { ...base, format: 'koinly' })

  it('uses the Koinly header', () => {
    expect(KOINLY_COLUMNS.join(',')).toBe('Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Label,Description,TxHash')
    expect(utcMinute(1792686958)).toBe('2026-10-22 16:35 UTC')
  })

  it('a swap is one trade row with the fee', () => {
    const swap = rows.find(r => String(r.TxHash).startsWith('53da68a1'))!
    expect(swap).toMatchObject({
      'Sent Amount': '40.989487', 'Sent Currency': 'USDT',
      'Received Amount': '30.714023583', 'Received Currency': 'GRAM',
      'Fee Amount': '0.004621112', 'Fee Currency': 'GRAM'
    })
  })

  it('rows are oldest first', () => {
    const dates = rows.map(r => String(r.Date))
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('detailed format with fiat', () => {
  const fiat = { currency: 'USD', points: new Map([['native', chart.points as RatePoint[]]]) }

  it('values GRAM rows at the day\'s rate and leaves unknown tokens blank', () => {
    // Fixture prices end 2026-10-13; move a swap into the covered range to price it.
    const ev = (page as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('53da68a1'))!
    const r = eventRecord({ ...ev, timestamp: Date.parse('2026-10-01T00:00:00Z') / 1000 }, SWAPPER)
    const rows = buildRows([r], { ...base, format: 'detailed', fiat })
    expect(Object.keys(rows[0]!)).toEqual(expect.arrayContaining(['Price (USD)', 'Value (USD)']))
    const gram = rows.find(x => x.Token === 'GRAM')!
    const usdt = rows.find(x => x.Token === 'USD₮')!
    expect(gram.Direction).toBe('in')
    expect(Number(gram['Value (USD)'])).toBeCloseTo(30.714023583 * 1.4991005396761943, 1)
    expect(usdt['Value (USD)']).toBe('')
    expect(usdt['Fee (GRAM)']).toBe('0.004621112')
    expect(gram['Fee (GRAM)']).toBe('')
    expect(columnsFor({ format: 'detailed', fiat })).toContain('Fee value (USD)')
  })

  it('failed events become fee-only rows unless excluded', () => {
    // The failed USD₮ transfer without its refund action: nothing moved, only the fee was paid.
    const ev = (page as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('b492e6f6'))!
    const r = eventRecord({ ...ev, actions: ev.actions.slice(0, 1) }, SWAPPER)
    expect(r.movements).toEqual([])
    expect(buildRows([r], { ...base, format: 'detailed' })).toMatchObject([{ 'Type': 'Fee', 'Status': 'failed', 'Fee (GRAM)': '0.170634884' }])
    expect(buildRows([r], { ...base, includeFailed: false, format: 'detailed' })).toEqual([])
  })
})

describe('totals and dates', () => {
  it('sums per token', () => {
    const t = totals(records, base)
    const usdt = t.tokens.find(x => x.asset.symbol === 'USD₮')!
    expect(usdt.sent).toBe(40989487n + 59765937n)
    expect(t.events).toBe(records.length)
  })

  it('date bounds are whole UTC days', () => {
    expect(dateBounds('2026-01-01', '2026-01-31')).toEqual({ start: 1767225600, end: 1769903999 })
    expect(() => dateBounds('2026-02-01', '2026-01-01')).toThrow(/after/)
    expect(presetRange('lastYear', new Date('2026-10-22'))).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })
})

describe('CSV formula injection (OWASP "CSV Injection": prefix cells starting with = + - @ tab CR)', () => {
  it('neutralizes formulas in on-chain comments and token symbols', () => {
    expect(safeText('=HYPERLINK("https://evil.example","claim")')).toBe('\'=HYPERLINK("https://evil.example","claim")')
    expect(safeText('@SUM(A1)')).toBe('\'@SUM(A1)')
    expect(safeText('player-11')).toBe('player-11')
    const ev = (commentEvent as unknown as TaEvent)
    const evil = { ...ev, actions: ev.actions.map(a => ({ ...a, TonTransfer: { ...(a.TonTransfer as object), comment: '=1+1' } })) }
    const rows = buildRows([eventRecord(evil, '0:bc8ffdbd936d009a27e004aeb2fb54bf29ee4839c40b8870fafbbc08f5da6fbf')], { ...base, format: 'detailed' })
    expect(rows[0]!.Comment).toBe('\'=1+1')
  })
})
