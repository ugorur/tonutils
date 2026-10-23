import { describe, expect, it } from 'vitest'
import fx from './fixture-wallet.json'
import type { LpClients, StonfiPool } from './logic'
import { activeStakes, fromStonfi, loadPositions, lpCandidate, poolUrl, tokenId, underlying, view } from './logic'

// Real mainnet responses fetched 2026-10-23 (trimmed): tonapi /v2/accounts/{owner}/jettons, /v2/jettons/_bulk,
// /v2/blockchain/accounts/{pool}/methods/get_reserves|get_assets, /v2/rates; STON.fi /v1/pools/{pool} and
// /v1/wallets/{owner}/farms. Expected token amounts and USD values were computed separately in Python
// (integer floor division: reserve * lp // supply).
const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
const STON = '0:3690254dc15b2297610cda60744a45f2b710aa4234b89adb630e99d79b01bd4f'
const TSTON = '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000'
const DEDUST_TON_USDT = '0:3e5ffca8ddfcf36c36c9ff46f31562aab51b9914845ad6c26cbde649d58a5588'

function fakeClients(farms: unknown = { farm_list: [] }, extraPools: Record<string, StonfiPool> = {}): LpClients & { calls: string[] } {
  const calls: string[] = []
  const stonfi = Object.fromEntries(Object.values({ ...fx.stonfi, ...extraPools }).map(p => [tokenId(p.address), p]))
  return {
    calls,
    async tonapi<T>(path: string): Promise<T> {
      calls.push(`tonapi ${path}`)
      if (path.endsWith('/jettons')) return fx.balances as T
      if (path.endsWith('get_reserves')) return fx.dedust.reserves as T
      if (path.endsWith('get_assets')) return fx.dedust.assets as T
      if (path === 'rates') return fx.rates as T
      throw new Error(`unexpected ${path}`)
    },
    async tonapiPost<T>(path: string, body: unknown): Promise<T> {
      const ids = (body as { account_ids: string[] }).account_ids
      calls.push(`tonapiPost ${path} ${ids.length}`)
      return (ids.includes(DEDUST_TON_USDT) ? fx.dedust.bulk : fx.tokens) as T
    },
    async stonfi<T>(path: string): Promise<T> {
      calls.push(`stonfi ${path}`)
      if (path.endsWith('/farms')) return farms as T
      const p = stonfi[path.split('/').pop()!]
      if (!p) throw Object.assign(new Error('Not found'), { status: 404 })
      return { pool: p } as T
    }
  }
}

describe('helpers', () => {
  it('recognises LP tokens by name only as a pre-filter', () => {
    expect(lpCandidate({ name: 'LP Token for STON-GRAM' })).toBe('stonfi')
    expect(lpCandidate({ name: 'DeDust Pool: TON/USDT' })).toBe('dedust')
    expect(lpCandidate({ name: 'DeDust Stable Pool: stTON/TON' })).toBe('dedust')
    expect(lpCandidate({ name: 'TON Storm LP', symbol: 'TON-SLP' })).toBeNull()
    expect(lpCandidate({ name: 'LOCKED GRAM' })).toBeNull()
  })

  it('maps the zero address to native GRAM', () => {
    expect(tokenId('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c')).toBe('native')
    expect(tokenId('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')).toBe(USDT)
  })

  it('computes the withdrawable amounts with floor division', () => {
    expect(underlying(167588336671n, 6534088324806n, [205042596199517n, 271142617466n])).toEqual([5258996501979n, 6954350477n])
    expect(underlying(1n, 0n, [5n, 5n])).toEqual([0n, 0n])
  })

  it('reads STON.fi v1, v2 and stable pools', () => {
    const v2stable = fromStonfi(fx.stonfi.EQBjiBVhFLQVCMS8mKMA3gS823m9Xeu9aXiZUYD4TP8GDvui as StonfiPool)
    expect(v2stable).toMatchObject({ dex: 'stonfi', variant: 'v2 stable', tokens: ['native', TSTON], lpSupply: 4081086583172525n })
    expect(fromStonfi(fx.stonfi.EQDtZHOtVWaf9UIU6rmjLPNLTGxNLNogvK5xUZlMRgZwQ4Gt as StonfiPool)).toMatchObject({ variant: 'v1', tokens: [STON, 'native'] })
    expect(poolUrl(v2stable)).toBe('https://app.ston.fi/pools/EQBjiBVhFLQVCMS8mKMA3gS823m9Xeu9aXiZUYD4TP8GDvui')
  })

  it('keeps only farm NFTs that still hold LP', () => {
    const s = activeStakes(fx.farmer.farms.farm_list)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ pool: tokenId('EQBbsMjyLRj-xJE4eqMbtgABvPq34TF_hwiAGEAUGUb5sNGO'), lp: 93633357941n, stake: { status: 'active', rewards: [{ token: STON, amount: 583227869605n }] } })
  })
})

describe('loadPositions', () => {
  it('finds the three STON.fi and one DeDust position of a real wallet and values them', async () => {
    const c = fakeClients()
    const r = await loadPositions(fx.owner, c, { mainnet: true })
    expect(r.warnings).toEqual([])
    expect(r.positions.map(p => `${p.pool.dex}:${p.pool.variant}:${p.lp}`).sort()).toEqual([
      'dedust:volatile:167588336671',
      'stonfi:v1:149902750',
      'stonfi:v1:2898516756',
      'stonfi:v2 stable:5960783600738'
    ])
    const views = r.positions.map(p => view(p, r.prices, r.tokens))
    const dd = views.find(v => v.pool.dex === 'dedust')!
    expect(dd.pool.tokens).toEqual(['native', USDT])
    expect(dd.amounts).toEqual([5258996501979n, 6954350477n])
    expect(dd.share).toBeCloseTo(0.025648312104, 10)
    expect(dd.value).toBeCloseTo(13903.732764, 4)
    const ts = views.find(v => v.pool.tokens.includes(TSTON))!
    expect(ts.amounts).toEqual([102943782091n, 138198350051n])
    expect(ts.value).toBeCloseTo(350.353399, 4)
    expect(views.find(v => v.lp === 149902750n)!.amounts).toEqual([478102408586n, 181630115696n])
    expect(views.find(v => v.lp === 2898516756n)!.amounts).toEqual([265103305640167n, 110934353673n])
    expect(r.tokens.get(USDT)).toMatchObject({ symbol: 'USD₮', decimals: 6 })
  })

  it('adds active STON.fi farm stakes', async () => {
    const pool = fx.farmer.pool as StonfiPool
    const c = fakeClients(fx.farmer.farms, { [pool.address]: pool })
    const r = await loadPositions(fx.farmer.owner, c, { mainnet: true })
    const farm = r.positions.filter(p => p.source === 'farm')
    expect(farm).toHaveLength(1)
    const v = view(farm[0]!, r.prices, r.tokens)
    expect(v.amounts).toEqual([4371536477639n, 2183063374n])
    expect(v.value).toBeCloseTo(4360.893676, 4)
    // the fully unstaked farm pool is never fetched
    expect(c.calls.filter(x => x.startsWith('stonfi /v1/pools/'))).toHaveLength(4)
  })

  it('skips prices and the mainnet-only STON.fi API on testnet', async () => {
    const c = fakeClients()
    const r = await loadPositions(fx.owner, c, { mainnet: false })
    expect(r.prices.size).toBe(0)
    expect(c.calls.some(x => x.startsWith('stonfi'))).toBe(false)
    expect(r.positions.map(p => p.pool.dex)).toEqual(['dedust'])
    expect(r.warnings).toEqual([expect.stringMatching(/STON\.fi positions are shown on mainnet only/)])
    expect(view(r.positions[0]!, r.prices, r.tokens).value).toBeNull()
  })
})
