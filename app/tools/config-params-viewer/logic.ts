import type { DecodedParam } from '~/lib/network/config'

export const GROUPS: { id: string, label: string, ids: number[] }[] = [
  { id: 'fees', label: 'Fees & economy', ids: [5, 6, 7, 13, 14, 18, 20, 21, 24, 25] },
  { id: 'validators', label: 'Validators & elections', ids: [15, 16, 17, 32, 33, 34, 35, 36, 37, 39, 40] },
  { id: 'protocol', label: 'Protocol & limits', ids: [8, 9, 10, 11, 12, 19, 22, 23, 28, 29, 30, 43, 45, 46] },
  { id: 'addresses', label: 'System contracts', ids: [0, 1, 2, 3, 4, 31, 44] },
  { id: 'bridges', label: 'Bridges', ids: [71, 72, 73, 79, 81, 82] }
]

export function groupOf(id: number): string {
  return GROUPS.find(g => g.ids.includes(id))?.id ?? 'other'
}

/** Matches "21", "gas", "-1:3333", a field label or value. */
export function filterParams(list: DecodedParam[], query: string, group = 'all'): DecodedParam[] {
  const q = query.trim().toLowerCase()
  return list.filter((p) => {
    if (group !== 'all' && groupOf(p.id) !== group) return false
    if (!q) return true
    if (/^\d+$/.test(q)) return p.id === Number(q)
    return [p.name, p.about, ...p.fields.flatMap(f => [f.label, f.value])].some(s => s.toLowerCase().includes(q))
  })
}

export type BlockRef = { seqno: number } | { unixtime: number } | null

/** "60000000" → seqno, "2025-01-31" → unix time at 00:00 UTC. Rejects future dates and garbage. */
export function parseBlockRef(input: string, now = Date.now()): BlockRef {
  const s = input.trim()
  if (/^\d{1,10}$/.test(s)) return Number(s) > 0 ? { seqno: Number(s) } : null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T00:00:00Z`)
    if (Number.isNaN(t) || t > now) return null
    return { unixtime: Math.floor(t / 1000) }
  }
  return null
}
