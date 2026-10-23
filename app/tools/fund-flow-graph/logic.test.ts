import { describe, expect, it } from 'vitest'
import fx from './fixtures/events.json'
import type { TaEvent } from './logic'
import { bounds, expand, flowsFromEvents, friendly, layout, loadEvents, newGraph } from './logic'

// tonapi.io /v2/accounts/{id}/events?start_date=1790812800&end_date=1792022400 recorded 2026-10-22 (trimmed):
//   ev  = wallet 0:88c9…cc46 (rus1an.ton), ev2 = its counterparty 0:b035…dbbf.
// Independent cross-check, toncenter v3 /actions for the same wallet and window (activity-wrapped fixture):
//   2 GRAM ton_transfer to 0:B035…DBBF; USD₮ jetton_transfer 200000000 and 100000000 to 0:A9BE…58D4;
//   STON.fi v2 swap: 97330000000 nanoGRAM in, 150060631 USD₮ out.
const ME = '0:88c94e160ec19cde32ffe72d9b5eb34ac224b28929b22f5d982d84039d6bcc46'
const B035 = '0:b035b72dde2dade460d163462ff339edb6291c0c28cbfc565474f0fd6be8dbbf'
const A9BE = '0:a9be548de6be52a88cee85c2b01380c531cf1f708a18739af74630cebbd858d4'
const ROUTER = '0:92e1411ae546892f33b2c8a89ea90390d8ff4cfbb917a643b91e73f706fdb9d1'
const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
const ev = fx.ev.events as TaEvent[]
const ev2 = fx.ev2.events as TaEvent[]

describe('flows from tonapi events', () => {
  const flows = flowsFromEvents(ev)

  it('extracts GRAM, jetton and swap legs; spam events are skipped', () => {
    expect(flows.find(f => f.to.address === B035 && f.kind === 'coin')!.amount).toBe(2000000000n)
    const usdtOut = flows.filter(f => f.from.address === ME && f.to.address === A9BE && f.asset === USDT).map(f => f.amount)
    expect(usdtOut).toEqual(expect.arrayContaining([200000000n, 100000000n]))
    expect(flows.find(f => f.from.address === ME && f.to.address === ROUTER)!.amount).toBe(97330000000n)
    expect(flows.find(f => f.from.address === ROUTER && f.to.address === ME)!.amount).toBe(150060631n)
    // the 1-nano "@TonFloodingBot" event is flagged is_scam by tonapi
    expect(flows.some(f => f.from.address === '0:53bff336e1032a6e2c848678cd09f614e742f645f987f49094893c35c6992709')).toBe(false)
    expect(flowsFromEvents(ev, { includeSpam: true }).length).toBeGreaterThan(flows.length)
  })
})

describe('contract calls and staking', () => {
  // tonapi.io /v2/accounts/0:88c9…cc46/events, event ea6e236c4b4b57f8f71835e63a4b91397c0e07a8a20df42d91f0f0e730bc1026
  // (1791101457, the DeDust GRAM -> USD₮ swap: tonapi reports it as SmartContractExec + JettonTransfer + refund) and
  // the Tonstakers withdrawal at 1791644788 (WithdrawStake 5437928315 from pool 0:a45b…22fa). Fetched 2026-10-23.
  const POOL = '0:07e0c63511ba8fec6836c0992866fa021b80583ec106e655415cf667d14a9737'
  const TONSTAKERS = '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa'
  const me = { address: ME, name: 'rus1an.ton', is_scam: false, is_wallet: true }
  const events: TaEvent[] = [
    { event_id: 'ea6e', timestamp: 1791101457, is_scam: false, actions: [
      { type: 'SmartContractExec', status: 'ok', SmartContractExec: { executor: me, contract: { address: POOL, is_scam: false, is_wallet: false }, ton_attached: 37331228695 } },
      { type: 'TonTransfer', status: 'ok', TonTransfer: { sender: { address: POOL, is_scam: false, is_wallet: false }, recipient: me, amount: 47445059 } }
    ] },
    { event_id: 'ws', timestamp: 1791644788, is_scam: false, actions: [
      { type: 'WithdrawStake', status: 'ok', WithdrawStake: { amount: 5437928315, staker: me, pool: { address: TONSTAKERS, name: 'Tonstakers', is_scam: false, is_wallet: false } } }
    ] }
  ]

  it('counts coins attached to a contract call and staking withdrawals', () => {
    const f = flowsFromEvents(events)
    expect(f.find(x => x.from.address === ME && x.to.address === POOL)!.amount).toBe(37331228695n)
    expect(f.find(x => x.from.address === POOL && x.to.address === ME)!.amount).toBe(47445059n)
    const w = f.find(x => x.from.address === TONSTAKERS)!
    expect(w.to.address).toBe(ME)
    expect(w.amount).toBe(5437928315n)
  })
})

describe('graph', () => {
  const g1 = expand(newGraph(ME), ME, flowsFromEvents(ev))

  it('adds counterparties with names and aggregated edges', () => {
    expect(g1.nodes.get(ME)!.expanded).toBe(true)
    expect(g1.nodes.get(ME)!.name).toBe('rus1an.ton')
    expect(g1.nodes.get(ROUTER)!.name).toBe('STON.fi DEX')
    expect(g1.nodes.get(B035)!.hop).toBe(1)
    const usdt = g1.edges.get(`${ME}>${A9BE}>${USDT}`)!
    expect(usdt.count).toBeGreaterThanOrEqual(2)
    expect(usdt.amount).toBeGreaterThanOrEqual(300000000n)
    expect(usdt.symbol).toBe('USD₮')
    expect(usdt.decimals).toBe(6)
  })

  it('expanding a neighbour adds its counterparties without double-counting shared actions', () => {
    const before = g1.edges.get(`${ME}>${B035}>GRAM`)!
    const g2 = expand(g1, B035, flowsFromEvents(ev2))
    expect(g2.edges.get(`${ME}>${B035}>GRAM`)).toEqual(before) // the 2 GRAM transfer appears in both feeds
    expect(g2.nodes.size).toBeGreaterThan(g1.nodes.size)
    expect([...g2.nodes.values()].some(n => n.hop === 2)).toBe(true)
  })

  it('caps new counterparties per expansion and reports the rest', () => {
    const g = expand(newGraph(ME), ME, flowsFromEvents(ev), 2)
    expect(g.nodes.size).toBe(3)
    expect(g.nodes.get(ME)!.hidden).toBeGreaterThan(0)
  })

  it('layout keeps the root at the origin and spreads nodes apart', () => {
    const l = layout(g1)
    expect(l.nodes.get(ME)).toMatchObject({ x: 0, y: 0 })
    const pts = [...l.nodes.values()]
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(20)
    }
    const b = bounds(l)
    expect(b.w).toBeGreaterThanOrEqual(200)
  })

  it('friendly addresses', () => {
    expect(friendly(ME, true, false)).toBe('UQCIyU4WDsGc3jL_5y2bXrNKwiSyiSmyL12YLYQDnWvMRqYo')
  })
})

describe('loading', () => {
  it('pages with before_lt and stops at next_from 0', async () => {
    const seen: unknown[] = []
    const get = async <T>(_p: string, q?: Record<string, unknown>) => {
      seen.push(q?.before_lt)
      return (seen.length === 1 ? { events: ev, next_from: 107315468000017 } : { events: ev2, next_from: 0 }) as T
    }
    const r = await loadEvents(get, ME, { from: 1, to: 2, maxPages: 3 })
    expect(seen).toEqual([undefined, 107315468000017])
    expect(r.more).toBe(false)
    expect(r.events).toHaveLength(ev.length + ev2.length)
  })
})
