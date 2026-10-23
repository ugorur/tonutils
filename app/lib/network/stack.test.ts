import { describe, expect, it } from 'vitest'
import { fromV2Stack } from './stack'
import lp from './fixtures/list-proposals.json'

describe('fromV2Stack', () => {
  it('top-level hex numbers, including negative', () => {
    // toncenter v2 encodes top-level ints as hex strings, e.g. elector elect_at 0x6adb4f08 = 1792757512
    expect(fromV2Stack([['num', '0x6adb4f08'], ['num', '-0x1'], ['num', '0x0']])).toEqual([1792757512n, -1n, 0n])
  })
  it('nested tuples, lists, cells (real list_proposals result)', () => {
    const [list] = fromV2Stack(lp.stack) as [unknown[][]]
    expect(list).toHaveLength(2)
    const [, body] = list[1] as [bigint, unknown[]]
    expect(body[0]).toBe(1793522962n)
    expect((body[2] as unknown[])[1]).toBe('te6cckEBAQEADwAAGsQAAAAQAAAAAAAAA+4UiXHK')
    expect((body[2] as unknown[])[2]).toBe(-1n)
    expect(body[4]).toEqual([])
  })
})
