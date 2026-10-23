// Vectors: conversions checked with GNU `date -u -d @<n>`; chain data from toncenter v3 (mainnet, 2026-10-23):
// masterchainInfo block 100816873 (gen_utime 1792742000), and tx 91671f17… (lt 111813286000010, utime 1792742091,
// mc_block_seqno 100817089) whose lt maps to masterchain block 100817089 via /blocks?workchain=-1&start_lt=…&sort=asc.
import { describe, expect, it } from 'vitest'
import { describeTime, ltBlockQuery, parseLt, parseTime, relative, toChainClock, validUntil } from './logic'

describe('parseTime', () => {
  it('detects units by digit count', () => {
    expect(parseTime('1700000000')).toEqual({ unix: 1700000000, kind: 'seconds' })
    expect(parseTime('1700000000123')).toEqual({ unix: 1700000000.123, kind: 'milliseconds' })
    expect(parseTime('1 700 000 000')).toEqual({ unix: 1700000000, kind: 'seconds' })
    expect(parseTime('1700000000123456').kind).toBe('microseconds')
  })
  it('reads dates, no timezone = UTC', () => {
    expect(parseTime('2026-06-15').unix).toBe(1781481600) // date -u -d 2026-06-15T00:00:00Z +%s (GRAM rename day)
    expect(parseTime('2026-06-15 00:00').unix).toBe(1781481600)
    expect(parseTime('2026-06-15T03:00:00+03:00').unix).toBe(1781481600)
    expect(parseTime('2023-11-14T22:13:20Z')).toEqual({ unix: 1700000000, kind: 'date' })
  })
  it('rejects junk', () => {
    expect(() => parseTime('')).toThrow()
    expect(() => parseTime('yesterday-ish')).toThrow(/Not a timestamp/)
    expect(() => parseTime('123456789012345678')).toThrow(/Too many digits/)
  })
})

describe('describeTime', () => {
  it('matches GNU date', () => {
    const d = describeTime(1700000000, 1700000000)
    expect(d.iso).toBe('2023-11-14T22:13:20.000Z') // date -u -d @1700000000
    expect(d.utc).toBe('Tue, 14 Nov 2023 22:13:20 GMT')
    expect(d.milliseconds).toBe('1700000000000')
    expect(describeTime(1792742000, 0).iso).toBe('2026-10-23T07:53:20.000Z') // date -u -d @1792742000
  })
  it('relative wording', () => {
    expect(relative(1300, 1000)).toBe('in 5 minutes')
    expect(relative(1000 - 3 * 86400, 1000)).toBe('3 days ago')
    expect(relative(1000, 1000)).toBe('now')
  })
})

describe('valid_until and lt', () => {
  it('adds whole seconds', () => {
    expect(validUntil(1792742000.9, 300)).toBe(1792742300)
  })
  it('parses lt as uint64', () => {
    expect(parseLt('111813286000010')).toBe(111813286000010n)
    expect(parseLt('18446744073709551615')).toBe(2n ** 64n - 1n)
    expect(parseLt('18446744073709551616')).toBeNull()
    expect(parseLt('-1')).toBeNull()
  })
  it('maps toncenter blocks', () => {
    const info = { workchain: -1, shard: '8000000000000000', seqno: 100816873, gen_utime: '1792742000', start_lt: '111813060000000', end_lt: '111813060000004' }
    expect(toChainClock(info)).toEqual({ seqno: 100816873, genUtime: 1792742000, startLt: 111813060000000n, endLt: 111813060000004n })
    expect(ltBlockQuery(111813286000010n)).toEqual({ workchain: -1, start_lt: '111813286000010', limit: 1, sort: 'asc' })
    const committed = toChainClock({ workchain: -1, shard: '8000000000000000', seqno: 100817089, gen_utime: '1792742091', start_lt: '111813287000000', end_lt: '111813287000004' })
    expect(committed.genUtime).toBe(1792742091) // = utime of the tx with that lt
  })
})
