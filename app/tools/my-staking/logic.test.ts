import { describe, expect, it } from 'vitest'
import type { StakingPool } from '~/lib/staking/pools'
import type { TonapiJetton } from './logic'
import { billAmount, buildOverview, isPayoutCollection } from './logic'

// All inputs are real tonapi responses (2026-10-22/23), trimmed to the fields we use.
const POOLS = [
  { address: '0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a', name: 'Tonkeeper Queue #1', implementation: 'whales', apy: 12.258967499999999, cycle_end: 1792856116 },
  { address: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa', name: 'Tonstakers', implementation: 'liquidTF', apy: 12.459616631498214, cycle_end: 1792790880, liquid_jetton_master: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000' }
] as StakingPool[]

// GET /v2/staking/nominator/0:2DC3AC43…3029/pools
const POSITION = { pool: '0:00ff9fdd8b3b80d70e8ea734d262f5e1bd4c184c33535bf3190dd67408629e7a', amount: 2787045217370, pending_deposit: 0, pending_withdraw: 0, ready_withdraw: 0 }

// GET /v2/accounts/0:04FC8FD2…FC37/jettons?currencies=ton,usd: tsTON plus a scam token that must be ignored.
const JETTONS: TonapiJetton[] = [
  { balance: '691000000000', price: { prices: { USD: 1.548936685218308, TON: 1.17129562631463 } }, wallet_address: { address: '0:bf5fcbad08c00435d3ec54059de1f1ec71f16bdf7cda7d528a06c54efb3b5c6e' }, jetton: { address: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', name: 'Tonstakers TON', symbol: 'tsTON', decimals: 9 } },
  { balance: '327000000000', price: { prices: { TON: 0, USD: 0 } }, wallet_address: { address: '0:115632de23e6312da94fad31c13511bd2a75474b416e24562b9ecf5992e4ebaf' }, jetton: { address: '0:5428fe211d6586e710604fa86f5a336bb2965f2a02d82d051ef99dfce4d47abc', name: 'TON Unlock at ton-unlock.cc', symbol: 'TON', decimals: 9 } }
]

// GET /v2/accounts/0:7978A72A…CC5B/nfts: the bill minted by the burn in tx 7BWki6odDAF0oxODFdFRZMfjKTGEwWy0NmrK5HWJSkc=.
// The collection 0:edbd0f…e498 is owned by the Tonstakers pool (GET /v2/nfts/collections/0:edbd0f…).
const BILL = {
  address: '0:bebeb8f0bdd04f460fc74b320777aa743cf0c897a0f225c071a3c9f97cd15dc9',
  collection: { address: '0:edbd0fbef5dfe5c61d34b39f5b1b6f131544ec3fdd7acd0dd0cfba63935ee498', name: 'Withdrawal Payout#1527' },
  metadata: { name: 'Bill for 71.917231432 Pool Jetton in Withdrawal Payout#1527' }
}

describe('bills', () => {
  it('reads the burned amount', () => {
    // Same amount as the burn's jetton amount (toncenter /jetton/burns: 71917231432).
    expect(billAmount(BILL.metadata.name)).toBe(71917231432n)
    expect(billAmount('Some NFT')).toBeNull()
    expect(isPayoutCollection(BILL)).toBe(true)
    expect(isPayoutCollection({ address: 'x', collection: { address: 'y', name: 'Withdrawal Payout#1527 (claim now)' } })).toBe(false)
  })
})

// GET /v2/staking/nominator/0:7978A72A…CC5B/pools: tonapi reports the in-flight tsTON unstake as a pending withdrawal.
const LIQUID_POSITION = { pool: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa', amount: 0, pending_deposit: 0, pending_withdraw: 84240000000, ready_withdraw: 0 }

describe('buildOverview', () => {
  it('does not double count a tsTON unstake shown both as position and bill', () => {
    const withBill = buildOverview({ positions: [LIQUID_POSITION], pools: POOLS, jettons: [], bills: [{ nft: BILL, pool: POOLS[1]!.address }], liquidRates: { [POOLS[1]!.address]: 1.171 } })
    expect(withBill.rows.map(r => r.kind)).toEqual(['bill'])
    const noBill = buildOverview({ positions: [LIQUID_POSITION], pools: POOLS, jettons: [], bills: [] })
    expect(noBill.rows).toHaveLength(1)
    expect(noBill.total).toBe(84240000000n)
  })
  it('values a bill from tonapi\'s pending_withdraw when the pool rate could not be read', () => {
    // tonapi values the same in-flight unstake (71.917231432 tsTON) at 84.24 GRAM.
    const o = buildOverview({ positions: [LIQUID_POSITION], pools: POOLS, jettons: [], bills: [{ nft: BILL, pool: POOLS[1]!.address }] })
    expect(Number(o.rows[0]!.value)).toBeCloseTo(84240000000, -2)
    // No position either: the tsTON market price from the jettons list.
    const p = buildOverview({ positions: [], pools: POOLS, jettons: JETTONS, bills: [{ nft: BILL, pool: POOLS[1]!.address }] })
    expect(p.rows.find(r => r.kind === 'bill')!.rate).toBe(1.17129562631463)
  })
  it('combines a nominator position, tsTON and a pending bill', () => {
    const o = buildOverview({ positions: [POSITION], pools: POOLS, jettons: JETTONS, bills: [{ nft: BILL, pool: POOLS[1]!.address }], liquidRates: { [POOLS[1]!.address]: 1.171 } })
    expect(o.rows.map(r => r.kind)).toEqual(['pool', 'liquid', 'bill'])
    const [pool, lst, bill] = o.rows
    expect(pool!.name).toBe('Tonkeeper Queue #1')
    expect(pool!.value).toBe(2787045217370n)
    // 12.26 % of 2787.045 GRAM (APY rounded to 2 decimals in basis points).
    expect(pool!.yearly).toBe(2787045217370n * 1226n / 10000n)
    expect(lst!.symbol).toBe('tsTON')
    expect(lst!.value).toBe(691000000000n * 1171000000n / 1000000000n)
    expect(bill!.tokens).toBe(71917231432n)
    expect(bill!.payoutAfter).toBe(1792790880)
    expect(o.total).toBe(pool!.value + lst!.value + bill!.value)
    expect(o.unknownApy).toBe(0)
  })
  it('falls back to the tonapi price and skips unknown jettons', () => {
    const o = buildOverview({ positions: [], pools: POOLS, jettons: JETTONS, bills: [] })
    expect(o.rows).toHaveLength(1)
    expect(o.rows[0]!.rate).toBeCloseTo(1.17129562631463, 12)
  })
  it('recognises bemo and Hipo tokens without APY', () => {
    // stGRAM master EQDNhy-… (KNOWN_JETTONS) in raw form.
    const st: TonapiJetton = { balance: '1000000000', price: { prices: { TON: 1.1858077320199156 } }, wallet_address: { address: '0:00' }, jetton: { address: '0:cd872fa7c5816052acdf5332260443faec9aacc8c21cca4d92e7f47034d11892', name: 'Staked GRAM', symbol: 'stGRAM', decimals: 9 } }
    const o = buildOverview({ positions: [], pools: POOLS, jettons: [st], bills: [] })
    expect(o.rows[0]!.name).toBe('stGRAM (bemo)')
    expect(o.rows[0]!.yearly).toBeUndefined()
    expect(o.unknownApy).toBe(1)
  })
})
