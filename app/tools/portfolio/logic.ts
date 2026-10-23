import type { Holding, Rate, TonapiJettonBalance } from '~/lib/accounts/core'
import { fiatValue, toHolding } from '~/lib/accounts/core'
import { COIN_DECIMALS, COIN_NAME, COIN_SYMBOL } from '~/utils/currency'

export const MAX_ACCOUNTS = 20

/** tonapi /v2/staking/nominator/{id}/pools item. Amounts are JSON numbers in nanoGRAM. */
export interface TonapiNominatorPool {
  pool: string
  amount: number
  pending_deposit: number
  pending_withdraw: number
  ready_withdraw: number
}

export interface AccountInput {
  raw: string
  label: string
  /** Exact nanoGRAM balance. */
  nano: bigint
  jettons: TonapiJettonBalance[]
  staking: TonapiNominatorPool[]
}

export type RowKind = 'coin' | 'jetton' | 'staked'

export interface PortfolioRow extends Holding {
  kind: RowKind
  /** How many of the given accounts hold it. */
  holders: number
}

export type Period = '24h' | '7d' | '30d'

export interface Portfolio {
  rows: PortfolioRow[]
  /** Unverified (tonapi verification "none") holdings, left out of totals unless included. */
  unverified: PortfolioRow[]
  /** Count of scam (blacklisted) tokens hidden entirely. */
  scam: number
  total: number
  /** Percent change of the counted value over each period (from per-asset price changes). */
  change: Record<Period, number | undefined>
  perAccount: { raw: string, label: string, coin: number, tokens: number, staked: number, total: number }[]
}

/** Staked GRAM still owned by the nominator: active stake + deposit waiting for the next round + withdrawal ready to claim. */
export function stakedNano(p: TonapiNominatorPool): bigint {
  // ponytail: tonapi sends JSON numbers; exact below 2^53 nano (~9M GRAM per pool position).
  return BigInt(Math.round(p.amount)) + BigInt(Math.round(p.pending_deposit)) + BigInt(Math.round(p.ready_withdraw))
}

function diffOf(r: Rate | undefined, p: Period): number | undefined {
  return p === '24h' ? r?.diff24h : p === '7d' ? r?.diff7d : r?.diff30d
}

/** Merges holdings across accounts (same jetton summed), values them and computes totals. */
export function buildPortfolio(
  accounts: AccountInput[],
  tonRate: Rate | undefined,
  currency: string,
  opts: { includeUnverified?: boolean, poolNames?: Record<string, string> } = {}
): Portfolio {
  const map = new Map<string, PortfolioRow>()
  const add = (row: Omit<PortfolioRow, 'holders' | 'value'>) => {
    const cur = map.get(`${row.kind}:${row.master}`)
    if (cur) {
      cur.units += row.units
      cur.holders++
    }
    else {
      map.set(`${row.kind}:${row.master}`, { ...row, holders: 1 })
    }
  }
  const coinBase = { decimals: COIN_DECIMALS, verification: 'whitelist', rate: tonRate?.price ? tonRate : undefined }
  let scam = 0
  const per: Portfolio['perAccount'] = []
  for (const a of accounts) {
    const acc = { raw: a.raw, label: a.label, coin: 0, tokens: 0, staked: 0, total: 0 }
    if (a.nano > 0n) add({ ...coinBase, kind: 'coin', master: 'ton', symbol: COIN_SYMBOL, name: COIN_NAME, units: a.nano })
    if (tonRate?.price) acc.coin = fiatValue(a.nano, COIN_DECIMALS, tonRate.price)
    for (const b of a.jettons) {
      if (b.balance === '0') continue
      const h = toHolding(b, currency)
      if (h.verification === 'blacklist') {
        scam++
        continue
      }
      add({ ...h, kind: 'jetton' })
      if (h.value !== undefined && (h.verification === 'whitelist' || opts.includeUnverified)) acc.tokens += h.value
    }
    for (const p of a.staking) {
      const units = stakedNano(p)
      if (units === 0n) continue
      const master = p.pool.toLowerCase()
      add({ ...coinBase, kind: 'staked', master, symbol: COIN_SYMBOL, name: `Staked in ${opts.poolNames?.[master] ?? 'nominator pool'}`, units })
      if (tonRate?.price) acc.staked += fiatValue(units, COIN_DECIMALS, tonRate.price)
    }
    acc.total = acc.coin + acc.tokens + acc.staked
    per.push(acc)
  }

  const all = [...map.values()].map(r => ({ ...r, value: r.rate ? fiatValue(r.units, r.decimals, r.rate.price) : undefined }))
  const byValue = (x: PortfolioRow, y: PortfolioRow) => (y.value ?? -1) - (x.value ?? -1) || x.symbol.localeCompare(y.symbol)
  const rows = all.filter(r => r.verification === 'whitelist').sort(byValue)
  const unverified = all.filter(r => r.verification !== 'whitelist').sort(byValue)
  const counted = opts.includeUnverified ? [...rows, ...unverified] : rows
  const total = counted.reduce((s, r) => s + (r.value ?? 0), 0)

  const change = {} as Portfolio['change']
  for (const p of ['24h', '7d', '30d'] as Period[]) {
    let prev = 0
    let now = 0
    for (const r of counted) {
      const d = diffOf(r.rate, p)
      if (r.value === undefined || d === undefined || d <= -100) continue
      now += r.value
      prev += r.value / (1 + d / 100)
    }
    change[p] = prev > 0 ? (now / prev - 1) * 100 : undefined
  }
  return { rows, unverified, scam, total, change, perAccount: per }
}
