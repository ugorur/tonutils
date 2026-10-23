import { Address } from '@ton/core'
import { COIN_SYMBOL } from '~/utils/currency'

// ---------------------------------------------------------------- tonapi /v2/accounts/{id}/events (fields we read)

export interface TaParty { address: string, name?: string, is_scam: boolean, is_wallet: boolean }
interface TaJetton { address: string, symbol: string, decimals: number, verification?: string }
export interface TaAction {
  type: string
  status: string
  TonTransfer?: { sender: TaParty, recipient: TaParty, amount: number | string }
  JettonTransfer?: { sender?: TaParty | null, recipient?: TaParty | null, amount: string, jetton: TaJetton }
  JettonSwap?: { user_wallet: TaParty, router: TaParty, amount_in: string, amount_out: string, ton_in?: number, ton_out?: number, jetton_master_in?: TaJetton | null, jetton_master_out?: TaJetton | null }
  NftPurchase?: { seller: TaParty, buyer: TaParty, amount: { value: string, token_name: string } }
  NftItemTransfer?: { sender?: TaParty | null, recipient?: TaParty | null, nft: string }
  /** A call into a contract with coins attached (DEX swaps without a JettonSwap action, bridges, games…). */
  SmartContractExec?: { executor: TaParty, contract: TaParty, ton_attached?: number | string, gram_attached?: number | string }
  DepositStake?: { amount: number | string, staker: TaParty, pool: TaParty }
  WithdrawStake?: { amount: number | string, staker: TaParty, pool: TaParty }
}
export interface TaEvent { event_id: string, timestamp: number, is_scam: boolean, in_progress?: boolean, actions: TaAction[] }

// ---------------------------------------------------------------- flows

export type AssetKind = 'coin' | 'jetton' | 'nft'
export interface Flow {
  /** event_id:action index, to drop the same action seen from both sides. */
  id: string
  from: TaParty
  to: TaParty
  kind: AssetKind
  /** 'GRAM', jetton master (raw) or 'NFT'. */
  asset: string
  symbol: string
  decimals: number
  amount: bigint
  time: number
}

const raw = (a: string) => a.toLowerCase()
const coin = (from: TaParty, to: TaParty, amount: bigint) => ({ from, to, kind: 'coin' as const, asset: COIN_SYMBOL, symbol: COIN_SYMBOL, decimals: 9, amount })
const jet = (from: TaParty, to: TaParty, j: TaJetton, amount: bigint) => ({ from, to, kind: 'jetton' as const, asset: raw(j.address), symbol: j.symbol || 'jetton', decimals: j.decimals ?? 9, amount })

/** Value movements in a page of events: GRAM and jetton transfers, swaps (two legs via the DEX router), coins sent into contract calls, staking deposits/withdrawals, NFT sales and moves. */
export function flowsFromEvents(events: TaEvent[], { includeSpam = false } = {}): Flow[] {
  const out: Flow[] = []
  for (const e of events) {
    if (e.is_scam && !includeSpam) continue
    e.actions.forEach((a, i) => {
      if (a.status !== 'ok') return
      const legs: Omit<Flow, 'id' | 'time'>[] = []
      if (a.TonTransfer) legs.push(coin(a.TonTransfer.sender, a.TonTransfer.recipient, BigInt(a.TonTransfer.amount)))
      else if (a.JettonTransfer?.sender && a.JettonTransfer.recipient) legs.push(jet(a.JettonTransfer.sender, a.JettonTransfer.recipient, a.JettonTransfer.jetton, BigInt(a.JettonTransfer.amount)))
      else if (a.JettonSwap) {
        const s = a.JettonSwap
        if (s.jetton_master_in && s.amount_in) legs.push(jet(s.user_wallet, s.router, s.jetton_master_in, BigInt(s.amount_in)))
        else if (s.ton_in) legs.push(coin(s.user_wallet, s.router, BigInt(s.ton_in)))
        if (s.jetton_master_out && s.amount_out) legs.push(jet(s.router, s.user_wallet, s.jetton_master_out, BigInt(s.amount_out)))
        else if (s.ton_out) legs.push(coin(s.router, s.user_wallet, BigInt(s.ton_out)))
      }
      else if (a.NftPurchase && a.NftPurchase.amount.token_name.toUpperCase() !== 'USDT') legs.push(coin(a.NftPurchase.buyer, a.NftPurchase.seller, BigInt(a.NftPurchase.amount.value)))
      else if (a.NftItemTransfer?.sender && a.NftItemTransfer.recipient) legs.push({ from: a.NftItemTransfer.sender, to: a.NftItemTransfer.recipient, kind: 'nft', asset: 'NFT', symbol: 'NFT', decimals: 0, amount: 1n })
      else if (a.SmartContractExec) {
        const x = a.SmartContractExec
        const v = BigInt(x.ton_attached ?? x.gram_attached ?? 0)
        if (v > 0n) legs.push(coin(x.executor, x.contract, v))
      }
      else if (a.DepositStake) legs.push(coin(a.DepositStake.staker, a.DepositStake.pool, BigInt(a.DepositStake.amount)))
      else if (a.WithdrawStake) legs.push(coin(a.WithdrawStake.pool, a.WithdrawStake.staker, BigInt(a.WithdrawStake.amount)))
      legs.forEach((l, j) => {
        if (raw(l.from.address) !== raw(l.to.address)) out.push({ ...l, id: `${e.event_id}:${i}:${j}`, time: e.timestamp })
      })
    })
  }
  return out
}

// ---------------------------------------------------------------- graph

export interface GNode {
  /** Raw, lower-case. */
  address: string
  name: string | null
  scam: boolean
  wallet: boolean
  /** Distance from the starting address in expansions. */
  hop: number
  expanded: boolean
  /** Counterparties left out when this node was expanded (beyond the per-node cap). */
  hidden: number
  x: number
  y: number
}

export interface GEdge {
  key: string
  from: string
  to: string
  kind: AssetKind
  asset: string
  symbol: string
  decimals: number
  amount: bigint
  count: number
  first: number
  last: number
}

export interface Graph {
  root: string
  nodes: Map<string, GNode>
  edges: Map<string, GEdge>
  seen: Set<string>
}

export function newGraph(root: TaParty | string): Graph {
  const p = typeof root === 'string' ? { address: root, is_scam: false, is_wallet: true } : root
  const g: Graph = { root: raw(p.address), nodes: new Map(), edges: new Map(), seen: new Set() }
  g.nodes.set(g.root, node(p, 0))
  return g
}

function node(p: TaParty, hop: number, x = 0, y = 0): GNode {
  return { address: raw(p.address), name: p.name ?? null, scam: p.is_scam, wallet: p.is_wallet, hop, expanded: false, hidden: 0, x, y }
}

/**
 * Adds the flows of `center` to the graph: at most `maxNeighbors` new counterparties (most interactions first),
 * plus every flow between nodes already on the graph. Returns a new Graph (Vue-friendly).
 */
export function expand(g: Graph, center: string, flows: Flow[], maxNeighbors = 20): Graph {
  const c = raw(center)
  const nodes = new Map(g.nodes)
  const edges = new Map(g.edges)
  const seen = new Set(g.seen)
  const cn = nodes.get(c)
  if (!cn) throw new Error('Expand a node that is on the graph.')

  const fresh = flows.filter(f => !seen.has(f.id))
  // Rank counterparties that are not on the graph yet.
  const score = new Map<string, { p: TaParty, n: number }>()
  for (const f of fresh) {
    const other = raw(f.from.address) === c ? f.to : raw(f.to.address) === c ? f.from : null
    if (!other || nodes.has(raw(other.address))) continue
    const s = score.get(raw(other.address)) ?? { p: other, n: 0 }
    s.n++
    score.set(raw(other.address), s)
  }
  const ranked = [...score.values()].sort((a, b) => b.n - a.n)
  const keep = ranked.slice(0, maxNeighbors)
  keep.forEach(({ p }, i) => {
    // Seed new nodes on a ring around the center; the layout spreads them out.
    const angle = (2 * Math.PI * i) / keep.length + cn.hop
    const r = 140
    nodes.set(raw(p.address), node(p, cn.hop + 1, cn.x + r * Math.cos(angle), cn.y + r * Math.sin(angle)))
  })
  nodes.set(c, { ...cn, expanded: true, hidden: ranked.length - keep.length })

  for (const f of fresh) {
    const a = raw(f.from.address)
    const b = raw(f.to.address)
    if (!nodes.has(a) || !nodes.has(b)) continue
    seen.add(f.id)
    const key = `${a}>${b}>${f.asset}`
    const e = edges.get(key)
    if (e) edges.set(key, { ...e, amount: e.amount + f.amount, count: e.count + 1, first: Math.min(e.first, f.time), last: Math.max(e.last, f.time) })
    else edges.set(key, { key, from: a, to: b, kind: f.kind, asset: f.asset, symbol: f.symbol, decimals: f.decimals, amount: f.amount, count: 1, first: f.time, last: f.time })
    // Labels learned later (e.g. an exchange name) improve existing nodes.
    for (const p of [f.from, f.to]) {
      const n = nodes.get(raw(p.address))!
      if ((!n.name && p.name) || (!n.scam && p.is_scam)) nodes.set(n.address, { ...n, name: n.name ?? p.name ?? null, scam: n.scam || p.is_scam })
    }
  }
  return { root: g.root, nodes, edges, seen }
}

/**
 * Force-directed layout (repulsion between all nodes, springs on edges, root pinned at 0,0).
 * Deterministic: starts from the current positions. O(n²) per iteration — fine for the ~600 nodes the expansion cap allows.
 */
export function layout(g: Graph, iterations = 200): Graph {
  const list = [...g.nodes.values()].map(n => ({ ...n }))
  const idx = new Map(list.map((n, i) => [n.address, i]))
  const links = [...g.edges.values()].map(e => [idx.get(e.from)!, idx.get(e.to)!] as const)
  const L = 90
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations
    const dx = new Float64Array(list.length)
    const dy = new Float64Array(list.length)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let x = list[i]!.x - list[j]!.x
        let y = list[i]!.y - list[j]!.y
        let d2 = x * x + y * y
        // Repulsion only acts nearby, so expanded clusters do not drift far apart.
        if (d2 > 9 * L * L) continue
        if (d2 < 0.01) {
          x = (i - j) * 0.1 + 0.1
          y = 0.1
          d2 = x * x + y * y
        }
        const f = (L * L) / d2
        dx[i]! += x * f * 0.05
        dy[i]! += y * f * 0.05
        dx[j]! -= x * f * 0.05
        dy[j]! -= y * f * 0.05
      }
    }
    for (const [a, b] of links) {
      if (a === b) continue
      const x = list[b]!.x - list[a]!.x
      const y = list[b]!.y - list[a]!.y
      const d = Math.sqrt(x * x + y * y) || 1
      const f = (d - L) / d * 0.1
      dx[a]! += x * f
      dy[a]! += y * f
      dx[b]! -= x * f
      dy[b]! -= y * f
    }
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!
      if (n.address === g.root) continue
      const m = Math.sqrt(dx[i]! ** 2 + dy[i]! ** 2)
      const cap = 30 * t + 1
      const k = m > cap ? cap / m : 1
      n.x += dx[i]! * k
      n.y += dy[i]! * k
    }
  }
  const root = list[idx.get(g.root)!]!
  const ox = root.x
  const oy = root.y
  return { ...g, nodes: new Map(list.map(n => [n.address, { ...n, x: n.x - ox, y: n.y - oy }])) }
}

/** Bounding box of the node positions with padding (for the SVG viewBox). */
export function bounds(g: Graph, pad = 60): { x: number, y: number, w: number, h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of g.nodes.values()) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, n.y)
  }
  if (!Number.isFinite(minX)) return { x: -100, y: -100, w: 200, h: 200 }
  return { x: minX - pad, y: minY - pad, w: Math.max(maxX - minX + 2 * pad, 200), h: Math.max(maxY - minY + 2 * pad, 200) }
}

/** User-friendly form of a raw address (wallets non-bounceable, contracts bounceable). */
export function friendly(rawAddr: string, wallet: boolean, testOnly: boolean): string {
  return Address.parse(rawAddr).toString({ bounceable: !wallet, testOnly, urlSafe: true })
}

export const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`

// ---------------------------------------------------------------- loading

export interface LoadOptions {
  from?: number
  to?: number
  /** Pages of 100 events (one request each, ~1 s). */
  maxPages?: number
  signal?: { aborted: boolean }
}

export type TonapiGet = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

/** Up to maxPages×100 most recent events of `account` in the date range. */
export async function loadEvents(get: TonapiGet, account: string, { from, to, maxPages = 2, signal }: LoadOptions = {}): Promise<{ events: TaEvent[], more: boolean }> {
  const events: TaEvent[] = []
  let before: number | undefined
  for (let p = 0; p < maxPages && !signal?.aborted; p++) {
    const r = await get<{ events: TaEvent[], next_from: number }>(`accounts/${account}/events`, { limit: 100, start_date: from, end_date: to, before_lt: before })
    events.push(...r.events)
    if (!r.next_from || !r.events.length) return { events, more: false }
    before = r.next_from
  }
  return { events, more: true }
}
