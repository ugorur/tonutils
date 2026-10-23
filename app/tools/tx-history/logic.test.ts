// Real mainnet events from tonapi.io (app/lib/tx-user/fixtures, saved 2026-10-22); fees cross-checked with toncenter.
import { describe, expect, it } from 'vitest'
import type { TaEvent, TaEventsPage } from '~/lib/tx-user/events'
import page from '~/lib/tx-user/fixtures/tonapi-account-events-swapper.json'
import commentEvent from '~/lib/tx-user/fixtures/tonapi-account-event-comment.json'
import commentTrace from '~/lib/tx-user/fixtures/toncenter-trace-comment.json'
import { dayLabel, groupByDay, matches, toHistoryItem, tokenOptions } from './logic'

const SWAPPER = 'UQA1oZvigoavK2fWe1imzZKmoAx6GlzHA0efVqJFNYJ6Mwtx'
const items = (page as unknown as TaEventsPage).events.map(e => toHistoryItem(e, SWAPPER))
const all = { kind: 'all' as const, asset: 'all', hideSpam: true }

describe('toHistoryItem', () => {
  it('fee equals the toncenter root tx total_fees + forward fee of the outgoing message', () => {
    const it0 = toHistoryItem(commentEvent as unknown as TaEvent, '0:bc8ffdbd936d009a27e004aeb2fb54bf29ee4839c40b8870fafbbc08f5da6fbf')
    const root = Object.values(commentTrace.traces[0]!.transactions).find(t => !t.in_msg?.source)!
    expect(it0.fee).toBe(BigInt(root.total_fees) + BigInt(root.out_msgs[0]!.fwd_fee!)) // 350758 + 44446
    expect(it0.actions[0]!.title).toBe('Sent 0.5 GRAM')
    expect(it0.actions[0]!.comment).toBe('player-11')
    expect(it0.actions[0]!.counterparty?.name).toBe('TON Foundation (OLD)')
  })

  it('failed transfer: fee is the real loss and the bounce is labelled as a refund', () => {
    const f = items.find(i => i.id.startsWith('b492e6f6'))!
    expect(f.fee).toBe(768219n) // toncenter: 478503 + 111780 + 170000000 - 169866665 + 44601
    expect(f.actions[1]!.title).toBe('Refund of 0.1698 GRAM (bounced)')
  })

  it('marks failed events', () => {
    const failed = items.filter(i => !i.ok).map(i => i.id.slice(0, 8))
    expect(failed).toEqual(['b492e6f6'])
  })
})

describe('filters', () => {
  it('by kind', () => {
    expect(items.filter(i => matches(i, { ...all, kind: 'swap' })).map(i => i.id.slice(0, 8))).toEqual(['53da68a1', '778aa912'])
    expect(items.filter(i => matches(i, { ...all, kind: 'failed' }))).toHaveLength(1)
    expect(items.filter(i => matches(i, { ...all, kind: 'send' })).length).toBeGreaterThanOrEqual(2)
  })

  it('by token (USD₮ master)', () => {
    const usdt = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
    // Two swaps and one 400 USD₮ transfer; the failed transfer moved nothing.
    expect(items.filter(i => matches(i, { ...all, asset: usdt })).map(i => i.id.slice(0, 8))).toEqual(['53da68a1', '778aa912', 'f09391a4'])
    expect(tokenOptions(items, true).map(t => t.label)).toEqual(['GRAM', 'USD₮'])
  })
})

describe('grouping', () => {
  it('labels days', () => {
    const now = new Date('2026-10-22T12:00:00')
    expect(dayLabel(now.getTime() / 1000 - 60, now)).toBe('Today')
    expect(dayLabel(now.getTime() / 1000 - 86400, now)).toBe('Yesterday')
    expect(groupByDay(items, new Date('2030-01-01')).flatMap(g => g.items)).toHaveLength(items.length)
  })
})
