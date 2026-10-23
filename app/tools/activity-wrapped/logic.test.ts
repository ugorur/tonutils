import { describe, expect, it } from 'vitest'
import type { V3Fetch } from '~/utils/api-client'
import type { V3Transaction } from '~/lib/accounts-history/transactions'
import fx from './fixtures/oct2026.json'
import type { ActivityData, V3Action } from './logic'
import { cardSvg, loadActivity, periodLabel, wrap, yearRange } from './logic'

// Recorded 2026-10-22 from mainnet, wallet 0:88C94E…CC46, 2026-10-01 00:00 UTC (1790812800) to 2026-10-15 00:00 UTC
// (1792022400): toncenter v3 /actions (20) and /transactions (20), trimmed to the fields used.
// Independent cross-checks from tonapi.io for the same wallet and window:
//   /v2/accounts/{id}/diff  -> balance_change -156140659055
//   /v2/accounts/{id}/events -> JettonSwap ton_in 97330000000 -> 150060631 USD₮ (STON.fi);
//                               USD₮ JettonTransfers sent by the wallet: 200000000, 6378, 100000000, 6332.
const ME = 'UQCIyU4WDsGc3jL_5y2bXrNKwiSyiSmyL12YLYQDnWvMRqYo'
const FROM = 1790812800
const TO = 1792022400
const USDT = '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE'
const data: ActivityData = {
  actions: fx.actions as V3Action[],
  transactions: fx.transactions as V3Transaction[],
  metadata: fx.metadata as ActivityData['metadata'],
  addressBook: fx.address_book as ActivityData['addressBook'],
  truncated: false
}

describe('wrap (mainnet vectors)', () => {
  const w = wrap(ME, FROM, TO, data)

  it('net change equals tonapi balance_change', () => {
    expect(w.netChange).toBe(-156140659055n)
    expect(w.transactions).toBe(20)
    expect(w.actions).toBe(20)
  })

  it('counts swaps and USD₮ flows like tonapi', () => {
    expect(w.swaps).toBe(3)
    const usdt = w.tokens.find(t => t.master === USDT)!
    expect(usdt.symbol).toBe('USD₮')
    expect(usdt.decimals).toBe(6)
    expect(usdt.sent).toBe(200000000n + 6378n + 100000000n + 6332n)
    // received through the two GRAM -> USD₮ swaps (STON.fi 150060631, DeDust 56984519)
    expect(usdt.received).toBe(150060631n + 56984519n)
    expect(w.tokens[0]!.master).toBe(USDT)
  })

  it('GRAM transfers: failed ones are skipped, self-wallet is excluded from counterparties', () => {
    // successful ton_transfer actions: 4 × 100000 + 1 in, one 2 GRAM out
    expect(w.gramIn).toBe(400001n)
    expect(w.gramOut).toBe(2000000000n)
    expect(w.counterparties.every(c => c.address !== w.address)).toBe(true)
    const big = w.counterparties.find(c => c.gramOut === 2000000000n)!
    expect(big.address).toBe('0:B035B72DDE2DADE460D163462FF339EDB6291C0C28CBFC565474F0FD6BE8DBBF')
  })

  it('months, busiest day and first/last activity', () => {
    expect(w.months.reduce((a, b) => a + b, 0)).toBe(20)
    // index 0 = the period's first local month (October, or September where 1 Oct 00:00 UTC is still 30 Sep)
    expect(w.months[0]! + w.months[1]!).toBe(20)
    expect(w.busiestDay!.count).toBeGreaterThanOrEqual(5)
    expect(w.firstActive).toBe(1790943649)
    expect(w.lastActive).toBe(1791644788)
  })
})

describe('loading', () => {
  it('pages actions and transactions and reports truncation', async () => {
    const seen: string[] = []
    const v3: V3Fetch = async <T>(path: string, q?: Record<string, unknown>) => {
      seen.push(`${path}@${q!.offset}`)
      if (path === 'actions') return { actions: fx.actions, metadata: fx.metadata, address_book: fx.address_book } as T
      return { transactions: fx.transactions } as T
    }
    const d = await loadActivity(v3, ME, FROM, TO)
    expect(seen).toEqual(['actions@0', 'transactions@0'])
    expect(d.truncated).toBe(false)
    expect(d.actions).toHaveLength(20)
  })

  it('"last 12 months" buckets actions by month from the start, across the year boundary', () => {
    const from = Math.floor(new Date(2025, 9, 15).getTime() / 1000) // 15 Oct 2025 local
    const at = (y: number, m: number) => ({ ...fx.actions[0], start_utime: Math.floor(new Date(y, m, 20).getTime() / 1000) }) as V3Action
    const w = wrap(ME, from, from + 365 * 86400, { ...data, transactions: [], actions: [at(2025, 9), at(2026, 0), at(2026, 0), at(2026, 8)] })
    expect(w.months).toEqual([1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(cardSvg(w, ME)).toMatch(/>O<\/text>[\s\S]*>N<\/text>[\s\S]*>D<\/text>[\s\S]*>J<\/text>/)
  })

  it('year range is local and capped at now', () => {
    const r = yearRange(2026, 1792687000)
    expect(new Date(r.from * 1000).getMonth()).toBe(0)
    expect(r.to).toBe(1792687000)
    expect(yearRange(2025, 1792687000).to - yearRange(2025, 1792687000).from).toBe(365 * 86400 - 1)
  })
})

describe('card', () => {
  const w = wrap(ME, FROM, TO, data)

  it('labels whole years and custom ranges', () => {
    const y = yearRange(2025, 1792687000)
    expect(periodLabel(y.from, y.to)).toBe('2025')
    expect(periodLabel(FROM + 43200, TO)).toMatch(/Oct 2026 – .*Oct 2026/)
  })

  it('renders the numbers into a well-formed SVG and escapes text', () => {
    const svg = cardSvg({ ...w, domain: 'a<b>&.ton' }, ME)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('>20<') // actions
    expect(svg).toContain('2 GRAM') // sent
    expect(svg).toContain('USD₮')
    expect(svg).toContain('a&#60;b&#62;&#38;.ton')
    expect(svg).not.toContain('a<b>')
  })
})
