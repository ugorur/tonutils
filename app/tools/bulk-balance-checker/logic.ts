import type { AccountState, ParsedRow } from '~/lib/accounts/core'
import { friendly } from '~/lib/accounts/core'
import { formatAmount } from '~/utils/units'

export const MAX_ROWS = 1000

export interface JettonPick {
  /** Master, lowercase raw. */
  master: string
  symbol: string
  decimals: number
}

export type RowStatus = 'ok' | 'invalid' | 'duplicate' | 'unresolved'

export interface ResultRow {
  line: number
  input: string
  label: string
  status: RowStatus
  raw?: string
  state?: AccountState
  /** Balance of the chosen jetton (0n when the owner has no jetton wallet). */
  jetton?: bigint
  note?: string
}

/** toncenter v3 /jetton/wallets item (only the fields used here). */
export interface ToncenterJettonWallet {
  owner: string
  jetton: string
  balance: string
  code_hash?: string
}

/**
 * Wallet code hashes that count as genuine wallets of a master: the master's own `jetton_wallet_code_hash`
 * (toncenter /jetton/masters) plus the most common code among its largest holders. The second is needed
 * because some masters report a hash no real wallet runs (tsTON: master says CJYh…, every wallet runs Er67…).
 */
export function trustedCodeHashes(masterHash: string | null | undefined, topWallets: { code_hash?: string }[]): Set<string> {
  const out = new Set<string>(masterHash ? [masterHash] : [])
  const counts = new Map<string, number>()
  for (const w of topWallets) if (w.code_hash) counts.set(w.code_hash, (counts.get(w.code_hash) ?? 0) + 1)
  // ponytail: majority vote of the top holders; a jetton mid-upgrade with two live wallet codes loses the minority.
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]
  if (top) out.add(top[0])
  return out
}

/**
 * Jetton balance per owner (lowercase raw), only for the given master. Anyone can deploy a contract that
 * claims to be a wallet of a real master, so when the genuine wallet code hashes are known
 * (`trustedCodeHashes`), wallets running other code are ignored.
 */
export function jettonBalancesByOwner(wallets: ToncenterJettonWallet[], master: string, codeHashes?: Set<string> | null): Map<string, bigint> {
  const out = new Map<string, bigint>()
  for (const w of wallets) {
    if (w.jetton.toLowerCase() !== master) continue
    if (codeHashes?.size && w.code_hash && !codeHashes.has(w.code_hash)) continue
    const o = w.owner.toLowerCase()
    out.set(o, (out.get(o) ?? 0n) + BigInt(w.balance))
  }
  return out
}

/** tonapi /v2/jettons/{master} -> symbol and decimals (tonapi resolves off-chain metadata; TEP-64 default 9). */
export function jettonFromTonapi(info: { metadata?: { address?: string, symbol?: string, decimals?: string | number }, verification?: string }): JettonPick & { verification: string } {
  const m = info.metadata ?? {}
  const d = Number(m.decimals ?? 9)
  return {
    master: (m.address ?? '').toLowerCase(),
    symbol: m.symbol || 'JETTON',
    decimals: Number.isInteger(d) && d >= 0 && d <= 255 ? d : 9,
    verification: info.verification ?? 'none'
  }
}

/** Joins parsed input rows with resolved names, fetched states and jetton balances, in input order. */
export function buildResults(
  rows: ParsedRow[],
  names: Map<string, string | Error>,
  states: Map<string, AccountState>,
  jetton?: Map<string, bigint>
): ResultRow[] {
  return rows.map((r) => {
    const base = { line: r.line, input: r.input, label: r.label }
    if (r.error) return { ...base, status: 'invalid', note: r.error }
    if (r.duplicateOf) return { ...base, status: 'duplicate', note: `Same as line ${r.duplicateOf}` }
    let raw = r.raw
    if (r.domain) {
      const res = names.get(r.domain)
      if (!res || res instanceof Error) return { ...base, status: 'unresolved', note: res instanceof Error ? res.message : 'Name not resolved' }
      raw = res
    }
    const state = states.get(raw!)
    return { ...base, status: 'ok', raw, state, jetton: jetton ? jetton.get(raw!) ?? 0n : undefined }
  })
}

export interface Summary {
  checked: number
  problems: number
  active: number
  empty: number
  total: bigint
  jettonTotal: bigint
}

export function summarize(rows: ResultRow[]): Summary {
  const ok = rows.filter(r => r.status === 'ok' && r.state)
  return {
    checked: ok.length,
    problems: rows.filter(r => r.status === 'invalid' || r.status === 'unresolved').length,
    active: ok.filter(r => r.state!.status === 'active').length,
    empty: ok.filter(r => r.state!.status === 'nonexist').length,
    total: ok.reduce((s, r) => s + r.state!.balance, 0n),
    jettonTotal: ok.reduce((s, r) => s + (r.jetton ?? 0n), 0n)
  }
}

/** CSV rows: exact decimal amounts (no grouping), every input line kept with its status. */
export function csvRows(rows: ResultRow[], opts: { testnet?: boolean, jetton?: JettonPick | null, coin: string }): Record<string, string | number>[] {
  return rows.map((r) => {
    const s = r.state
    const out: Record<string, string | number> = {
      line: r.line,
      input: r.input,
      label: r.label,
      status: r.status === 'ok' ? s?.status ?? '' : r.status,
      address: r.raw && s ? friendly(r.raw, { wallet: s.isWallet || s.status !== 'active', testnet: opts.testnet }) : '',
      raw: r.raw ?? '',
      [`balance_${opts.coin}`]: s ? formatAmount(s.balance, 9, { group: false }) : '',
      balance_nano: s ? s.balance.toString() : '',
      type: s?.kind ?? '',
      seqno: s?.seqno ?? '',
      name: s?.name ?? '',
      scam: s?.isScam ? 'yes' : '',
      last_activity_utc: s?.lastActivity ? new Date(s.lastActivity * 1000).toISOString() : '',
      note: r.note ?? ''
    }
    if (opts.jetton) out[`balance_${opts.jetton.symbol}`] = r.jetton !== undefined ? formatAmount(r.jetton, opts.jetton.decimals, { group: false }) : ''
    return out
  })
}
