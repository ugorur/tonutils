import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { decodeParam } from '~/lib/network/config'
import cfg from '~/lib/network/fixtures/config-params.json'
import { filterParams, groupOf, GROUPS, parseBlockRef } from './logic'

// Real mainnet param cells (toncenter getConfigParam, seqno 100816818).
const P = cfg.params as Record<string, string>
const list = Object.keys(P).filter(k => /^\d+$/.test(k)).map(k => decodeParam(Number(k), Cell.fromBase64(P[k]!)))

describe('filterParams', () => {
  it('by id, name and decoded value', () => {
    expect(filterParams(list, '21').map(p => p.id)).toEqual([21])
    expect(filterParams(list, 'gas').map(p => p.id)).toEqual([20, 21, 22, 23, 45]) // gas prices, block gas limits, precompiled gas
    expect(filterParams(list, '-1:3333').map(p => p.id)).toEqual([1, 31]) // elector address, also a fundamental contract
    expect(filterParams(list, '300,000').map(p => p.id)).toEqual([17]) // min stake 300,000 GRAM
  })
  it('by group', () => {
    expect(filterParams(list, '', 'validators').map(p => p.id)).toEqual([15, 16, 17])
    expect(filterParams(list, '', 'all')).toHaveLength(list.length)
  })
  it('every defined param has one group', () => {
    const all = GROUPS.flatMap(g => g.ids)
    expect(new Set(all).size).toBe(all.length)
    expect(groupOf(999)).toBe('other')
  })
})

describe('parseBlockRef', () => {
  const now = Date.parse('2026-10-23T00:00:00Z')
  it('seqno or date', () => {
    expect(parseBlockRef('60000000', now)).toEqual({ seqno: 60000000 })
    // toncenter lookupBlock?unixtime=1735603200 → mc seqno 43469739 (2024-12-31)
    expect(parseBlockRef('2024-12-31', now)).toEqual({ unixtime: 1735603200 })
  })
  it('rejects junk and the future', () => {
    expect(parseBlockRef('2027-01-01', now)).toBeNull()
    expect(parseBlockRef('abc', now)).toBeNull()
    expect(parseBlockRef('0', now)).toBeNull()
  })
})
