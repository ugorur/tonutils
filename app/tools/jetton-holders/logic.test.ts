import { describe, expect, it } from 'vitest'
import type { TonapiHolder } from './logic'
import { buildHolders, concentration, formatShare, holderKind, sharePercent } from './logic'

const USDT_RAW = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
// tonapi GET /v2/jettons/{USD₮}: total_supply, 2026-10-22.
const USDT_SUPPLY = 1429976002510000n
// tonapi GET /v2/jettons/{USD₮}/holders?limit=5, 2026-10-22 (icons trimmed).
const USDT_TOP5: TonapiHolder[] = [
  { address: '0:2626cf30b702bdded845efc883efa45029ff59defdacc4ce7b8b0a5966d75002', owner: { address: '0:23fa979918f1fe702db9100bf843e87c7015eccd39a4721e9b6bac170bc04ce3', name: 'tether-treasury.ton', is_scam: false, is_wallet: true }, balance: '939188090649145' },
  { address: '0:bb699fbf1bfb567929f4199d07725c19bc6201a7e091ad2b1b3226d31cdea5e2', owner: { address: '0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309', name: 'Binance Hot Wallet', is_scam: false, is_wallet: true }, balance: '42021203548524' },
  { address: '0:2374492ce2de67fa4bca1fcaabcc9aa46d673328c38e40fffe7634a0274d1f64', owner: { address: '0:8afbcb163358eb20be1ae9b610a2938038d84a1087e7f49cccbf8046f59c859f', is_scam: false, is_wallet: true }, balance: '39303644678168' },
  { address: '0:cd1c7e5820e05a146e1f44ed7c646196a86e94827aa662c8c15937fd1581fcc6', owner: { address: '0:a3db61dfe9c6cb7265aebd4dc484312f456ead1441fbb6cfcb15b6d9ccdc89f5', is_scam: false, is_wallet: true }, balance: '18000007000100' },
  { address: '0:8a359bbdf0a2362a1f67f8e9c38a68ff1c27b8298d4484c4905be3e6660ac18c', owner: { address: '0:4a1c20bc9a6f9294f75f1c87a7f383a8b73a483a2e6dcb3630ddbe78b3ccad00', name: 'Bybit 10', is_scam: false, is_wallet: true }, balance: '17994181224809' }
]

describe('sharePercent', () => {
  it('matches exact integer math (Python: b*10^6//supply/10^4)', () => {
    expect(sharePercent(939188090649145n, USDT_SUPPLY)).toBe(65.6785)
    expect(sharePercent(42021203548524n, USDT_SUPPLY)).toBe(2.9385)
    expect(sharePercent(1n, 0n)).toBe(0)
  })
})

describe('holderKind', () => {
  it('labels exchanges, burn address and the token contract', () => {
    expect(holderKind(USDT_TOP5[1]!.owner, USDT_RAW)).toBe('exchange')
    expect(holderKind(USDT_TOP5[4]!.owner, USDT_RAW)).toBe('exchange')
    expect(holderKind(USDT_TOP5[0]!.owner, USDT_RAW)).toBe('wallet')
    expect(holderKind({ address: '0:0000000000000000000000000000000000000000000000000000000000000000' }, USDT_RAW)).toBe('burn')
    expect(holderKind({ address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', is_wallet: false }, USDT_RAW)).toBe('master')
    expect(holderKind({ address: '0:1111111111111111111111111111111111111111111111111111111111111111', is_wallet: false }, USDT_RAW)).toBe('contract')
    expect(holderKind({ address: '0:1111111111111111111111111111111111111111111111111111111111111111', is_scam: true }, USDT_RAW)).toBe('scam')
  })
})

describe('buildHolders + concentration', () => {
  it('ranks USD₮ holders and scores concentration', () => {
    const rows = buildHolders(USDT_TOP5, USDT_SUPPLY, USDT_RAW)
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5])
    expect(rows[0]).toMatchObject({ owner: USDT_TOP5[0]!.owner.address, wallet: USDT_TOP5[0]!.address, balance: 939188090649145n, name: 'tether-treasury.ton' })
    const c = concentration(rows)
    expect(c.top1).toBe(65.6785)
    // 65.6785 + 2.9385 + 2.7485 + 1.2587 + 1.2583
    expect(c.top10).toBeCloseTo(73.8825, 6)
    // without Binance and Bybit
    expect(c.top10Wallets).toBeCloseTo(65.6785 + 2.7485 + 1.2587, 6)
    expect(c.level).toBe('high')
    expect(buildHolders(USDT_TOP5.slice(1, 2), USDT_SUPPLY, USDT_RAW, 100)[0]!.rank).toBe(101)
  })
  it('formats shares', () => {
    expect(formatShare(65.6785)).toBe('65.68%')
    expect(formatShare(2.9385)).toBe('2.9385%')
    expect(formatShare(1.5)).toBe('1.5%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(0.00001)).toBe('<0.0001%')
  })
})
