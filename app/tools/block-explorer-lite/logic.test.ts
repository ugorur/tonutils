import { describe, expect, it } from 'vitest'
import fx from './fixtures/mc-40000000.json'
import { accountBits, age, shardHex, inShard, parseSeqno, shardCoverage, shardLabel, shardOf, shardPrefix } from './logic'

// Masterchain block 40000000 (mainnet, 2024) had the basechain split into many shards. Every transaction's
// block_ref (toncenter v3, see fixture _source) names the shard the indexer put it in: shardOf must agree.
describe('shard of an account (real split shards)', () => {
  it.each(fx.transactions.map(t => [t.account, t.block_ref.workchain, t.block_ref.shard] as const))('%s is in %i:%s', (account, wc, shard) => {
    const hit = shardOf(account, fx.blocks)
    expect(hit).not.toBeNull()
    expect([hit!.workchain, hit!.shard]).toEqual([wc, shard])
    expect(inShard(account, wc, shard)).toBe(true)
  })

  it('an account is in exactly one basechain shard of the block', () => {
    for (const t of fx.transactions.filter(t => t.block_ref.workchain === 0)) {
      const hits = fx.blocks.filter(b => inShard(t.account, b.workchain, b.shard))
      expect(new Set(hits.map(b => b.shard)).size).toBe(1)
    }
  })
})

describe('v2 getShards layout (signed decimal ids)', () => {
  it('converts to the same shard ids v3 reports for the same blocks', () => {
    const v3 = new Map(fx.blocks.filter(b => b.workchain === 0).map(b => [b.seqno, b.shard]))
    const matched = fx.getShards.filter(s => v3.has(s.seqno))
    expect(matched.length).toBeGreaterThan(4)
    for (const s of matched) expect(shardHex(s.shard)).toBe(v3.get(s.seqno))
    expect(shardHex('-9223372036854775808')).toBe('8000000000000000')
  })

  it('the full layout covers the whole address space exactly once', () => {
    const total = fx.getShards.reduce((a, s) => a + shardCoverage(shardHex(s.shard)), 0)
    expect(total).toBe(1)
    for (const t of fx.transactions.filter(t => t.block_ref.workchain === 0)) {
      expect(shardOf(t.account, fx.getShards.map(s => ({ workchain: s.workchain, shard: shardHex(s.shard) })))?.shard).toBe(t.block_ref.shard)
    }
  })
})

describe('shard prefixes (TON docs: shard id = prefix bits, a 1 bit, then zeros)', () => {
  it('decodes prefixes and depths', () => {
    expect(shardPrefix('8000000000000000')).toEqual({ bits: '', depth: 0 })
    expect(shardPrefix('C000000000000000')).toEqual({ bits: '1', depth: 1 })
    expect(shardPrefix('4000000000000000')).toEqual({ bits: '0', depth: 1 })
    expect(shardPrefix('E800000000000000')).toEqual({ bits: '1110', depth: 4 })
    expect(shardPrefix('F800000000000000')).toEqual({ bits: '1111', depth: 4 })
    expect(shardLabel(0, '3000000000000000')).toBe('0:001*')
    expect(shardCoverage('D000000000000000')).toBe(1 / 8)
    expect(() => shardPrefix('0000000000000000')).toThrow()
  })

  it('the whole-workchain shard holds every account of its workchain only', () => {
    expect(inShard('0:' + 'f'.repeat(64), 0, '8000000000000000')).toBe(true)
    expect(inShard('-1:' + '3'.repeat(64), 0, '8000000000000000')).toBe(false)
    expect(accountBits('E16FD1E37C855ED1' + '0'.repeat(48), 8)).toBe('11100001')
  })
})

describe('input and formatting', () => {
  it('parses seqnos and block ids', () => {
    expect(parseSeqno('40000000')).toBe(40000000)
    expect(parseSeqno(' 40 000 000 ')).toBe(40000000)
    expect(parseSeqno('(-1,8000000000000000,40000000)')).toBe(40000000)
    expect(parseSeqno('0')).toBeNull()
    expect(parseSeqno('abc')).toBeNull()
  })

  it('formats ages', () => {
    expect(age(100, 105)).toBe('5 s ago')
    expect(age(0, 7200)).toBe('2 h ago')
  })
})
