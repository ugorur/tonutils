import { describe, expect, it } from 'vitest'
import type { TcNftItem } from '~/lib/dns-read/api'
import type { DnsItemData } from '~/lib/dns-read/core'
import { parseItemData } from '~/lib/dns-read/core'
import fx from './fixtures.json'
import { buildIcs, buildRows, csvRows, urgency } from './logic'

// Real data for tolya.ton's wallet (see fixtures.json _source): 12 domains.
const data = new Map<string, DnsItemData | null>(Object.entries(fx.dataBoc as Record<string, string>).map(([k, v]) => [k, parseItemData(v)]))
const owned = fx.owned as TcNftItem[]
const NOW = 1792699000 // 2026-10-22

describe('buildRows', () => {
  const rows = buildRows(owned, data, NOW)
  it('computes the same expiry as tonapi for every domain, soonest first', () => {
    expect(rows).toHaveLength(12)
    const tonapi = fx.tonapiExpiring as Record<string, number>
    for (const r of rows) expect(r.expiresAt, r.name).toBe(tonapi[`${r.name}.ton`])
    expect(rows.slice(0, 2).map(r => r.name)).toEqual(['solanasucks', 'foundation'])
    expect(rows.map(r => r.expiresAt)).toEqual([...rows.map(r => r.expiresAt)].sort((a, b) => a - b))
  })
  it('rates urgency', () => {
    expect(rows[0]!.urgency).toBe('soon') // solanasucks.ton: 2026-11-20
    expect(rows[1]!.urgency).toBe('warn') // foundation.ton: 2026-12-01
    expect(rows.at(-1)!.urgency).toBe('ok')
    expect(urgency(NOW - 1, NOW)).toBe('expired')
  })
  it('skips items without data', () => {
    expect(buildRows(owned, new Map(), NOW)).toEqual([])
  })
})

describe('buildIcs', () => {
  const rows = buildRows(owned, data, NOW)
  const ics = buildIcs(rows, { leadDays: 30, now: NOW })
  const lines = ics.split('\r\n')
  it('is a valid RFC 5545 calendar with one event per active domain', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(lines.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(12)
    expect(lines.every(l => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
  })
  it('reminds 30 days before, or in an hour when that is already past', () => {
    // foundation.ton expires 1796149277 (2026-12-01 18:21:17 UTC) → 2026-11-01 18:21:17 UTC
    expect(ics).toContain('DTSTART:20261101T182117Z')
    // solanasucks.ton expires 1795171812 (2026-11-20): 30 days before is past → NOW + 1 h
    expect(ics).toContain('DTSTART:20261022T205640Z')
    expect(ics).toContain('SUMMARY:Renew foundation.ton')
  })
  it('escapes TEXT values (RFC 5545 3.3.11)', () => {
    const out = buildIcs([{ name: 'x;y,z', item: '0:ab', expiresAt: NOW + 400 * 86400, lastRenewed: NOW, urgency: 'ok' as const }], { leadDays: 7, now: NOW })
    expect(out).toContain('SUMMARY:Renew x\\;y\\,z.ton')
  })
  it('escapes commas and folds long lines', () => {
    const long = [{ name: 'a'.repeat(100), item: '0:ab', expiresAt: NOW + 400 * 86400, lastRenewed: NOW, urgency: 'ok' as const }]
    const out = buildIcs(long, { leadDays: 7, now: NOW })
    expect(out).toContain('\r\n ')
    expect(out.replace(/\r\n /g, '')).toContain(`SUMMARY:Renew ${'a'.repeat(100)}.ton`)
  })
  it('skips expired domains', () => {
    expect(buildIcs(rows, { leadDays: 30, now: 1900000000 })).not.toContain('BEGIN:VEVENT')
  })
})

describe('csvRows', () => {
  it('exports UTC dates', () => {
    const c = csvRows(buildRows(owned, data, NOW))
    expect(c[1]).toMatchObject({ domain: 'foundation.ton', status: 'active', expires_utc: '2026-12-01 18:21 UTC' })
  })
})
