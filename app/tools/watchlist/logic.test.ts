import { describe, expect, it } from 'vitest'
import type { ToncenterWalletStates } from '~/lib/accounts/core'
import { mergeStates } from '~/lib/accounts/core'
import type { WatchItem } from '~/lib/accounts/watchlist'
import { baselineOf, buildRows, sortRows, totalBalance, withSnapshot } from './logic'

const BINANCE = '0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4'
const W5 = '0:4da6d2ad61da4f90e319095825556690d0fc303470f19186fa36f2320dc51381'
const TF = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8'
const NEW = '0:1234567812345678123456781234567812345678123456781234567812345678'

// toncenter v3 /walletStates?address=Binance&address=W5&address=TF (mainnet, 2026-10-22), trimmed.
const TC: ToncenterWalletStates = {
  wallets: [
    { address: BINANCE.toUpperCase(), is_wallet: true, wallet_type: 'wallet v3 r2', seqno: 57057, balance: '782434819540', status: 'active', code_hash: 'hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=' },
    { address: W5.toUpperCase(), is_wallet: true, wallet_type: 'wallet v5 r1', seqno: 5, balance: '2337549923624094', status: 'active', code_hash: 'IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=' },
    { address: TF.toUpperCase(), is_wallet: true, wallet_type: 'wallet v3 r2', seqno: 343, balance: '1592542221079555', status: 'active', code_hash: 'hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=' }
  ]
}
const states = new Map(mergeStates([BINANCE, W5, TF, NEW], TC, null).map(s => [s.raw, s]))

// Stored items from an earlier visit. Binance's baseline is its real balance before tx lt 111703363000029
// (toncenter v3 /transactions account_state_before, 669222826208); TF did not move since.
const ITEMS: WatchItem[] = [
  { raw: BINANCE, label: 'Binance', addedAt: 1, lastBalance: '669222826208', lastCheckedAt: 1792698000000 },
  { raw: W5, label: '', addedAt: 2 },
  { raw: TF, label: 'Foundation', addedAt: 3, lastBalance: '1592542221079555', lastCheckedAt: 1792698000000 },
  { raw: NEW, label: 'fresh', addedAt: 4, lastBalance: 'junk' }
]

describe('watchlist rows', () => {
  const rows = buildRows(ITEMS, states, baselineOf(ITEMS))
  it('shows the change since the previous visit', () => {
    // 782434819540 - 669222826208 (python)
    expect(rows[0]).toMatchObject({ delta: 113211993332n, since: 1792698000000 })
    expect(rows[1]!.delta).toBeUndefined()
    expect(rows[2]!.delta).toBeUndefined() // unchanged
    expect(rows[3]).toMatchObject({ delta: undefined, state: { status: 'nonexist', balance: 0n } })
  })
  it('sums exact balances', () => {
    expect(totalBalance(rows)).toBe(3930874579523189n)
  })
  it('stores the new balances for next time', () => {
    const next = withSnapshot(ITEMS, states, 1792700000000)
    expect(next[0]).toMatchObject({ lastBalance: '782434819540', lastCheckedAt: 1792700000000, label: 'Binance' })
    expect(next[3]).toMatchObject({ lastBalance: '0' })
    expect(withSnapshot(ITEMS, new Map())[1]).toBe(ITEMS[1])
  })
  it('sorts', () => {
    expect(sortRows(rows, 'balance').map(r => r.item.raw)).toEqual([W5, TF, BINANCE, NEW])
    expect(sortRows(rows, 'label').map(r => r.item.label)).toEqual(['Binance', 'Foundation', 'fresh', ''])
    expect(sortRows(rows, 'added')).toBe(rows)
  })
})
