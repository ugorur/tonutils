import type { AccountState } from '~/lib/accounts/core'

export const PAGE_SIZE = 100
/** toncenter serves the ranking for any offset, but past ~1000 the list is mostly anonymous wallets. */
export const MAX_ROWS = 1000

/** toncenter v3 /topAccountsByBalance item. */
export interface TopAccount {
  account: string
  balance: string
}

export interface RichRow {
  rank: number
  /** Lowercase raw address. */
  raw: string
  balance: bigint
  name?: string
  kind: string
  isWallet: boolean
  isScam?: boolean
  lastActivity?: number
  /** Fraction of total supply, when the supply is known. */
  share: number | null
  /** Fraction of total supply held by this row and every row above it. */
  cumulative: number | null
}

/**
 * Ranks one page. `known` (ton-assets labels) wins over tonapi's name, which can be a .ton domain.
 * `before` is the nano sum of all rows on earlier pages, for the running total.
 */
export function buildRows(
  top: TopAccount[],
  offset: number,
  states: Map<string, AccountState>,
  known: Map<string, string>,
  totalSupplyCoins: number | null,
  before = 0n
): RichRow[] {
  let running = before
  return top.map((t, i) => {
    const raw = t.account.toLowerCase()
    const balance = BigInt(t.balance)
    running += balance
    const s = states.get(raw)
    return {
      rank: offset + i + 1,
      raw,
      balance,
      name: known.get(raw) ?? s?.name,
      // Inactive early-miner accounts locked by the 2023 validator vote show up as plain "uninit" otherwise.
      kind: s?.suspended ? 'Suspended' : s?.kind ?? (raw.startsWith('-1:') ? 'System contract' : 'Unknown'),
      isWallet: s?.isWallet ?? false,
      isScam: s?.isScam,
      lastActivity: s?.lastActivity,
      share: share(balance, totalSupplyCoins),
      cumulative: share(running, totalSupplyCoins)
    }
  })
}

function share(nano: bigint, totalCoins: number | null): number | null {
  if (!totalCoins || totalCoins <= 0) return null
  return Number(nano) / 1e9 / totalCoins
}
