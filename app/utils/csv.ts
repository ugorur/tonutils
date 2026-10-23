// RFC 4180 CSV. Pure TS (auto-imported). bigint/Date/objects are stringified safely.

export type CsvRow = Record<string, unknown>

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)) : String(v)
  // Formula injection (OWASP CSV injection): on-chain text like NFT names can start with = + - @. Plain numbers stay as is.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,]*(e[+-]?\d+)?$/i.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows to CSV text. Columns default to the union of keys in row order. */
export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap(r => Object.keys(r)))]
  return [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

/** Triggers a browser download of text content. Client only. */
export function downloadText(content: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
