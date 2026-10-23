import { describe, expect, it } from 'vitest'
import type { AccountStatus, TonapiAccount } from '~/lib/accounts/core'
import { mergeStates } from '~/lib/accounts/core'
import { parseKnownAccounts } from '~/lib/defi-analytics/shared'
import fx from './fixture-top5.json'
import { buildRows } from './logic'

// Real mainnet data fetched 2026-10-23: toncenter /api/v3/topAccountsByBalance?limit=5, toncenter
// /api/v3/walletStates and tonapi /v2/accounts/_bulk for the same 5 accounts, and their entries in
// tonkeeper/ton-assets accounts.json. Total supply from CoinGecko the same day.
const TOTAL_SUPPLY = 5271060131.261505

describe('buildRows', () => {
  const raws = fx.top.map(t => t.account.toLowerCase())
  const states = new Map(mergeStates(raws, fx.walletStates as never, fx.tonapi as (TonapiAccount & { status: AccountStatus })[]).map(s => [s.raw, s]))
  const rows = buildRows(fx.top, 0, states, parseKnownAccounts(fx.known), TOTAL_SUPPLY)

  it('keeps the indexer order and exact balances', () => {
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5])
    expect(rows[0]).toMatchObject({ raw: '-1:3333333333333333333333333333333333333333333333333333333333333333', balance: 1376409000503424695n })
    expect(rows[4]!.balance).toBe(102424467668804255n)
  })

  it('labels known accounts and falls back to the tonapi name (a .ton domain here)', () => {
    expect(rows.map(r => r.name)).toEqual(['Elector Contract', 'TON Believers Fund', 'thedns-tg-channell.ton', undefined, 'Telegram'])
  })

  // Rank 4 is uninit with toncenter "suspended": true (tonapi "is_suspended": true): one of the inactive
  // early-miner accounts frozen by the 2023 network vote.
  it('describes the account type', () => {
    expect(rows.map(r => r.kind)).toEqual(['Elector', 'Locker', 'Wallet v3R2', 'Suspended', 'Wallet v3R2'])
    expect(rows.map(r => r.isWallet)).toEqual([false, false, true, false, true])
  })

  it('computes share and running share of the total supply', () => {
    // 1376409000.503424695 / 5271060131.261505 = 0.2611256 ; top-5 sum / supply = 0.5853394
    expect(rows[0]!.share).toBeCloseTo(0.2611256, 6)
    expect(rows[4]!.cumulative).toBeCloseTo(0.5853394, 6)
    expect(buildRows(fx.top, 0, states, new Map(), null)[0]!.share).toBeNull()
  })

  it('continues ranks and the running total on later pages', () => {
    const page2 = buildRows(fx.top.slice(0, 1), 100, states, new Map(), TOTAL_SUPPLY, 1000000000n * 1000000000n)
    expect(page2[0]!.rank).toBe(101)
    // (1e9 + 1376409000.503424695) / 5271060131.261505
    expect(page2[0]!.cumulative).toBeCloseTo(0.4508408, 6)
  })
})
