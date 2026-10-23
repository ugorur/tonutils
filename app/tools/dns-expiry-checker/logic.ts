import type { TcNftItem } from '~/lib/dns-read/api'
import type { DnsItemData, Net } from '~/lib/dns-read/core'
import { dnsStatus, dnsTonOrgUrl, utcDate } from '~/lib/dns-read/core'

export type Urgency = 'expired' | 'soon' | 'warn' | 'ok'

export interface ExpiryRow {
  name: string
  /** Lowercase raw item address. */
  item: string
  expiresAt: number
  lastRenewed: number
  urgency: Urgency
}

const DAY = 86400

export function urgency(expiresAt: number, now: number): Urgency {
  if (expiresAt <= now) return 'expired'
  if (expiresAt - now < 30 * DAY) return 'soon'
  if (expiresAt - now < 90 * DAY) return 'warn'
  return 'ok'
}

/**
 * Joins the owner's DNS NFTs (toncenter nft/items) with their on-chain data. Expiry is computed from the
 * contract (last_fill_up_time + 1 year), never from an indexer. Sorted soonest first.
 */
export function buildRows(owned: TcNftItem[], data: Map<string, DnsItemData | null>, now: number): ExpiryRow[] {
  const rows: ExpiryRow[] = []
  for (const it of owned) {
    const item = it.address.toLowerCase()
    const d = data.get(item)
    if (!d) continue
    const name = d.domain || (it.content?.domain ?? '').replace(/\.ton$/, '')
    const st = dnsStatus(name, d, now)
    // A running auction means the item has no owner yet (indexer lag): not this wallet's domain.
    if (st.kind === 'available' || st.kind === 'auction') continue
    rows.push({ name, item, expiresAt: st.expiresAt, lastRenewed: d.lastFillUpTime, urgency: urgency(st.expiresAt, now) })
  }
  return rows.sort((a, b) => a.expiresAt - b.expiresAt || a.name.localeCompare(b.name))
}

// RFC 5545: escape TEXT values, fold lines at 75 octets with CRLF + space.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const stamp = (t: number) => new Date(t * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
      len = 0
    }
    cur += ch
    len += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/**
 * One reminder event per domain, `leadDays` before it expires (or in an hour if that moment has passed).
 * Expired domains are skipped.
 */
export function buildIcs(rows: ExpiryRow[], { leadDays, now, network = 'mainnet' }: { leadDays: number, now: number, network?: Net }): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tonutils.io//TON DNS expiry//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const r of rows) {
    if (r.expiresAt <= now) continue
    const start = Math.max(r.expiresAt - leadDays * DAY, now + 3600)
    const url = dnsTonOrgUrl(r.name, network)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.item.replace(':', '-')}-${r.expiresAt}@tonutils.io`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(start + 1800)}`,
      `SUMMARY:${esc(`Renew ${r.name}.ton`)}`,
      `DESCRIPTION:${esc(`${r.name}.ton expires on ${utcDate(r.expiresAt)}. After that anyone can start an auction for it. Renew it from the owner wallet at ${url}`)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`Renew ${r.name}.ton`)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function csvRows(rows: ExpiryRow[]) {
  return rows.map(r => ({
    domain: `${r.name}.ton`,
    status: r.urgency === 'expired' ? 'expired' : 'active',
    expires_utc: utcDate(r.expiresAt),
    last_renewed_utc: utcDate(r.lastRenewed),
    item_address: r.item
  }))
}
