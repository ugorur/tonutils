import { describe, expect, it } from 'vitest'
import poisoned from '~/lib/security/fixtures/events-poisoned.json'
import spammed from '~/lib/security/fixtures/events-spammed.json'
import { rawOf } from '~/lib/security/core'
import type { TaEvent } from '~/lib/tx-user/events'
import { detectPoisoning, EXAMPLE, fakeCount, fetchEvents, highlight, verdict } from './logic'

// Fixtures: real tonapi /v2/accounts/{id}/events pages (provenance in each file's _source).
const events = poisoned.events as unknown as TaEvent[]

describe('address poisoning on a real poisoned wallet', () => {
  const r = detectPoisoning(events, rawOf(EXAMPLE)!)
  it('is poisoned, with fakes of UQB7of…w7ja', () => {
    expect(verdict(r)).toBe('poisoned')
    expect(fakeCount(r)).toBeGreaterThanOrEqual(15)
    expect(r.groups[0]!.real.raw).toBe(rawOf('UQB7ofZ_NC0tqu9HGlngAi_TZrd3ajfd3HFp6Gz2JUgiw7ja'))
  })
  it('highlights what matches: tag + first char and the "w7ja" ending', () => {
    const f = r.groups[0]!.fakes.find(x => x.match.suffix === 4)!
    expect(highlight(f.cp.raw, f.match)).toEqual([
      { text: 'UQB', hit: true },
      { text: 'qc8IJqOnIKKN78FLxTEFRi7mtisxNiIQ_80EiFBYW', hit: false },
      { text: 'w7ja', hit: true }
    ])
  })
})

describe('verdicts', () => {
  it('spam only / empty', () => {
    expect(verdict(detectPoisoning(spammed.events as unknown as TaEvent[], rawOf('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')!))).toBe('spam')
    expect(verdict(detectPoisoning([], '0:00'))).toBe('empty')
  })
})

describe('fetchEvents paging', () => {
  it('follows next_from as before_lt and stops at max', async () => {
    const calls: Record<string, unknown>[] = []
    const page = (n: number, next: number) => ({ events: events.slice(0, n), next_from: next })
    const get = async <T>(_p: string, q?: Record<string, unknown>) => {
      calls.push(q ?? {})
      return (calls.length === 1 ? page(100, 111) : page(50, 0)) as T
    }
    const r = await fetchEvents(get, '0:abc', 300)
    expect(r.events.length).toBe(150)
    expect(r.more).toBe(false)
    expect(calls).toEqual([{ limit: 100, before_lt: undefined }, { limit: 100, before_lt: 111 }])
    calls.length = 0
    const one = await fetchEvents(get, '0:abc', 100)
    expect(one).toMatchObject({ more: true })
    expect(calls.length).toBe(1)
  })
})
