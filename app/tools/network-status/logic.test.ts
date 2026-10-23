import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import cfg from '~/lib/network/fixtures/config-params.json'
import { ago, avgInterval, health, highlights } from './logic'

// Config params from toncenter getConfigParam at mc seqno 100816818 (values cross-checked with tonapi).
const map = new Map(['8', '12', '15', '17', '18', '21', '25'].map(id => [Number(id), Cell.fromBase64((cfg.params as Record<string, string>)[id]!)]))

describe('highlights (mainnet config)', () => {
  const h = Object.fromEntries(highlights(map, 1792741874).map(x => [x.label, x]))
  it('reads version, gas, forward and storage fees', () => {
    expect(h['Protocol version']!.value).toBe('16')
    expect(h['Gas price (basechain)']!.value).toBe('66.6667 nano per gas')
    expect(h['Gas price (basechain)']!.hint).toContain('1M gas ≈ 0.0666 GRAM') // 4369067 × 1e6 / 65536 = 66666671 nano
    expect(h['Message forward fee']!.value).toBe('from 0.000066667 GRAM')
    // 135 nano per cell per 65536 s (entry since 1777500000) → 64962 nano per year
    expect(h['Storage fee']!.value).toBe('0.000064 GRAM per cell per year')
    expect(h['Minimum validator stake']!.value).toBe('300,000 GRAM')
    expect(h['Basechain max shards']!.value).toBe('4')
  })
  it('uses the storage price in force at the given time', () => {
    const before = Object.fromEntries(highlights(map, 1777499999).map(x => [x.label, x]))
    expect(before['Storage fee']!.value).toBe('0.00024 GRAM per cell per year') // 500 × 31536000 / 65536 = 240600 nano
  })
  it('skips params that are missing', () => {
    expect(highlights(new Map())).toEqual([])
  })
})

describe('helpers', () => {
  it('health', () => {
    expect(health(2, false)).toBe('ok')
    expect(health(120, false)).toBe('lagging')
    expect(health(null, true)).toBe('down')
    expect(health(null, true, true)).toBe('limited')
  })
  it('avgInterval from real v3 /blocks gen_utime values (2026-10-23)', () => {
    expect(avgInterval([1792742514, 1792742514, 1792742514, 1792742513, 1792742513, 1792742512, 1792742512, 1792742511, 1792742511, 1792742510, 1792742510, 1792742510, 1792742509, 1792742509, 1792742508, 1792742508, 1792742508, 1792742507, 1792742507, 1792742506])).toBeCloseTo(8 / 19)
    expect(avgInterval([1])).toBeNull()
  })
  it('ago', () => {
    expect(ago(0.2)).toBe('just now')
    expect(ago(3)).toBe('3 s ago')
    expect(ago(600)).toBe('10 min ago')
  })
})
