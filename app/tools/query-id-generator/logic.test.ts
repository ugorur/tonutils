// Vectors: real mainnet jetton_transfer query_ids from toncenter v3 /messages?opcode=0x0f8a7ea5 (2026-10-23),
// each compared with the message's created_at; plus the highload v3 layout (query_id = shift << 10 | bit_number,
// ton-blockchain/highload-wallet-contract-v3 HighloadQueryId).
import { describe, expect, it } from 'vitest'
import { decodeQueryId, generate, parseQueryId, UINT64_MAX } from './logic'

const NOW = 1792742814

describe('decode real query_ids', () => {
  const real: [string, string, number, string][] = [
    // [msg hash, query_id, created_at, expected label]
    ['Jp1OQxzrvr3+Q73Z4myTeGQyrv3xaNATzw4qexOMYFo=', '1792742811625', 1792742814, 'Milliseconds'],
    ['RCTDEraBT3/ZqkLuHOU+obALJat0jVVmwFy7eMjDEpM=', '1792742802', 1792742803, 'Unix seconds'],
    ['ItIAh9myVKeaXq+hXw6kEIXP08VaZ6+4od/+tmNYkA4=', '1792742809157419873', 1792742813, 'Nanoseconds']
  ]
  it.each(real)('%s', (_hash, q, createdAt, label) => {
    const d = decodeQueryId(parseQueryId(q), NOW)
    const hit = d.interpretations.find(i => i.label === label)
    expect(hit?.unix).toBeDefined()
    expect(Math.abs(hit!.unix! - createdAt)).toBeLessThan(10)
    expect(d.interpretations.filter(i => i.unix !== undefined)).toHaveLength(1)
  })

  it('random ids carry no time', () => {
    // Q6TyxP/M…: 0xf83891d4f7618558
    const d = decodeQueryId(17886206263971382616n, NOW)
    expect(d.hex).toBe('0xf83891d4f7618558')
    expect(d.interpretations).toEqual([{ label: 'No pattern', detail: 'Looks random: no timestamp inside.' }])
  })

  it('small counters read as highload v3', () => {
    expect(decodeQueryId(12345n, NOW).interpretations[0]).toEqual({ label: 'Highload wallet v3', detail: 'shift 12, bit_number 57' })
    expect(decodeQueryId(1023n, NOW).interpretations[0]!.detail).toMatch(/invalid/)
  })

  it('high 32 bits as a time', () => {
    const v = (BigInt(NOW + 60) << 32n) | 12345n
    const hit = decodeQueryId(v, NOW).interpretations.find(i => i.label.startsWith('(time'))
    expect(hit?.unix).toBe(NOW + 60)
  })
})

describe('parse / generate', () => {
  it('parses decimal, hex, binary', () => {
    expect(parseQueryId('0x0f')).toBe(15n)
    expect(parseQueryId('0b101')).toBe(5n)
    expect(parseQueryId('1 000')).toBe(1000n)
    expect(parseQueryId('18446744073709551615')).toBe(UINT64_MAX)
    expect(() => parseQueryId('18446744073709551616')).toThrow(/uint64/)
    expect(() => parseQueryId('-5')).toThrow()
    expect(() => parseQueryId('abc')).toThrow()
  })
  it('generates each mode', () => {
    const nowMs = 1792742811625
    expect(generate({ mode: 'ms', count: 2, nowMs })).toEqual([1792742811625n, 1792742811626n])
    expect(generate({ mode: 'seconds', count: 1, nowMs })).toEqual([1792742811n])
    expect(generate({ mode: 'sequential', count: 3, nowMs, start: UINT64_MAX - 1n })).toEqual([UINT64_MAX - 1n, UINT64_MAX, 0n])
    const [e] = generate({ mode: 'expiry-shift', count: 1, nowMs, ttl: 60 })
    expect(e! >> 32n).toBe(1792742871n)
    const rnd = generate({ mode: 'random', count: 50, nowMs })
    expect(new Set(rnd).size).toBe(50)
    expect(rnd.every(r => r >= 0n && r <= UINT64_MAX)).toBe(true)
    expect(generate({ mode: 'random', count: 99999, nowMs })).toHaveLength(1000)
  })
})
