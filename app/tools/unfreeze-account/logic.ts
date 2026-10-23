// Unfreeze a frozen account: find the freeze, recover the pre-freeze StateInit from the archive,
// verify its hash against frozen_hash, and size the non-bounceable message that restores it.
// Approach follows TON Core's unfreezer (github.com/ton-blockchain/unfreezer, MIT).
import { Address, beginCell, Cell, Dictionary, loadStateInit, loadTransaction, storeMessage } from '@ton/core'
import type { DictionaryValue, StateInit } from '@ton/core'
import type { AccountSnapshot, V2Fetch, V3Fetch } from '~/lib/accounts-history/state'
import { fetchAccountAt, parseShardAccount, stateInitCell } from '~/lib/accounts-history/state'

// ---------------------------------------------------------------- finding the freeze

export interface V3Tx {
  hash: string
  lt: string
  now: number
  orig_status: string
  end_status: string
  mc_block_seqno: number
  account_state_after?: { frozen_hash?: string | null } | null
}

export interface FreezeInfo {
  /** The transaction that moved the account into the frozen state we are undoing. */
  freezeTx: V3Tx
  /** Masterchain block just before it: the account state there is the one to restore. */
  stateBlock: number
  /** toncenter requests spent searching. */
  requests: number
}

const b64ToHex = (b: string) => Array.from(atob(b), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

/**
 * Finds the transaction that froze `address` with state hash `frozenHashHex`: first in the latest 100
 * transactions, else by binary search over time (the latest tx at time ≤ T is "frozen with our hash" or not),
 * which stays ~30 requests even with years of frozen→frozen spam.
 */
export async function findFreeze(v3: V3Fetch, address: string, frozenHashHex: string, onStep?: (text: string) => void): Promise<FreezeInfo | null> {
  let requests = 0
  const page = async (q: Record<string, string | number>) => {
    requests++
    return (await v3<{ transactions: V3Tx[] }>('transactions', { account: address, ...q })).transactions
  }
  // A frozen tx whose indexed frozen_hash is a different hash belongs to an older freeze cycle.
  const ours = (t: V3Tx) => {
    const h = t.account_state_after?.frozen_hash
    return t.end_status === 'frozen' && (!h || b64ToHex(h) === frozenHashHex.toLowerCase())
  }
  const transition = (t: V3Tx) => ours(t) && t.orig_status !== 'frozen'
  const done = (t: V3Tx): FreezeInfo => ({ freezeTx: t, stateBlock: t.mc_block_seqno - 1, requests })

  onStep?.('Reading the latest transactions…')
  const latest = await page({ sort: 'desc', limit: 100 })
  if (!latest.length || !ours(latest[0]!)) return null
  const hit = latest.find(transition)
  if (hit) return done(hit)
  if (latest.length < 100) return null

  const first = (await page({ sort: 'asc', limit: 1 }))[0]
  if (!first) return null
  if (transition(first)) return done(first)

  // Invariant: latest tx at ≤ lo is not ours, latest tx at ≤ hi is ours.
  let lo = first.now - 1
  let hi = latest.at(-1)!.now
  for (let step = 1; hi - lo > 1; step++) {
    if (step > 48) return null
    onStep?.(`Searching the history for the freeze (step ${step})…`)
    const mid = Math.floor((lo + hi) / 2)
    const t = (await page({ sort: 'desc', end_utime: mid, limit: 1 }))[0]
    if (!t || !ours(t)) lo = mid
    else if (transition(t)) return done(t)
    else hi = Math.min(mid, t.now)
  }
  onStep?.('Locating the freeze transaction…')
  const near = await page({ sort: 'asc', start_utime: lo + 1, limit: 100 })
  const found = near.find(transition)
  return found ? done(found) : null
}

// ---------------------------------------------------------------- state recovery

export interface Recovered {
  stateInit: StateInit
  cell: Cell
  /** hex */
  hash: string
  matches: boolean
  bytes: number
}

/** The StateInit the account had at `seqno`, checked against the frozen hash. Null if it was not active there. */
export async function recoverAt(v2: V2Fetch, address: string, seqno: number, frozenHashHex: string): Promise<Recovered | null> {
  const s = await fetchAccountAt(v2, address, seqno)
  return s.stateInit ? checkStateInit(s.stateInit, frozenHashHex) : null
}

export function checkStateInit(stateInit: StateInit, frozenHashHex: string): Recovered {
  const cell = stateInitCell(stateInit)
  const hash = cell.hash().toString('hex')
  return { stateInit, cell, hash, matches: hash === frozenHashHex.toLowerCase(), bytes: cell.toBoc().length }
}

/**
 * Manual input: a StateInit BOC, or code + data BOCs (base64 or hex).
 * Note: code + data rebuild a StateInit without libraries/special; that only matches contracts that had none.
 */
export function parseManualState(stateInitBoc: string, codeBoc: string, dataBoc: string): StateInit {
  const cell = (s: string, what: string) => {
    const t = s.trim()
    try {
      return /^[0-9a-f]+$/i.test(t) && t.length % 2 === 0 ? Cell.fromBoc(Buffer.from(t, 'hex'))[0]! : Cell.fromBase64(t)
    }
    catch {
      throw new Error(`The ${what} is not a valid BOC (base64 or hex).`)
    }
  }
  if (stateInitBoc.trim()) return loadStateInit(cell(stateInitBoc, 'StateInit').beginParse())
  if (!codeBoc.trim() || !dataBoc.trim()) throw new Error('Paste a StateInit BOC, or both the code and the data BOC.')
  return { code: cell(codeBoc, 'code'), data: cell(dataBoc, 'data') }
}

/** A wallet broadcasts the unfreeze as an external message; config 43 caps those at 65,535 bytes. */
export const MAX_STATE_INIT_BYTES = 64_000

// ---------------------------------------------------------------- fees

export interface StoragePrices { bit: bigint, cell: bigint, mcBit: bigint, mcCell: bigint }

const pricesValue: DictionaryValue<StoragePrices & { since: number }> = {
  serialize: (src, b) => {
    b.storeUint(0xCC, 8).storeUint(src.since, 32).storeUint(src.bit, 64).storeUint(src.cell, 64).storeUint(src.mcBit, 64).storeUint(src.mcCell, 64)
  },
  parse: (s) => {
    if (s.loadUint(8) !== 0xCC) throw new Error('Invalid config 18 entry')
    return { since: s.loadUint(32), bit: s.loadUintBig(64), cell: s.loadUintBig(64), mcBit: s.loadUintBig(64), mcCell: s.loadUintBig(64) }
  }
}

/** Config param 18 (base64 BOC from v2 getConfigParam): the storage prices in force now (latest utime_since ≤ now). */
export function parseConfig18(boc: string, now = Math.floor(Date.now() / 1000)): StoragePrices {
  const dict = Dictionary.loadDirect(Dictionary.Keys.Uint(32), pricesValue, Cell.fromBase64(boc).beginParse())
  let best: (StoragePrices & { since: number }) | undefined
  for (const v of dict.values()) if (v.since <= now && (!best || v.since > best.since)) best = v
  if (!best) throw new Error('Empty config 18')
  return { bit: best.bit, cell: best.cell, mcBit: best.mcBit, mcCell: best.mcCell }
}

export async function fetchStoragePrices(v2: V2Fetch): Promise<StoragePrices> {
  const r = await v2<{ config: { bytes: string } }>('getConfigParam', { config_id: 18 })
  return parseConfig18(r.config.bytes)
}

/** Storage fee for `cells`/`bits` over `seconds` (prices are per second in 2^-16 nanoGRAM), rounded up. */
export function storageFee(p: StoragePrices, seconds: number, masterchain: boolean, cells: bigint, bits: bigint): bigint {
  if (seconds <= 0) return 0n
  const v = BigInt(Math.ceil(seconds)) * (cells * (masterchain ? p.mcCell : p.cell) + bits * (masterchain ? p.mcBit : p.bit))
  return (v + 65535n) >> 16n
}

/** Unique cells and their bits in a tree (storage is charged once per distinct cell). */
export function cellStats(root: Cell): { cells: bigint, bits: bigint } {
  const seen = new Set<string>()
  let bits = 0
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    bits += c.bits.length
    c.refs.forEach(walk)
  }
  walk(root)
  return { cells: BigInt(seen.size), bits: BigInt(bits) }
}

export const MONTH = 30 * 86400
/** Extra on top of the debt so the compute phase (running the restored code on an empty message) has gas. */
export const GAS_RESERVE = 50_000_000n

export interface UnfreezeCost {
  /** Debt now: stored due_payment + rent accrued on the frozen stub since last_paid. */
  debt: bigint
  /** Rent for the restored state over the prepaid months. */
  rent: bigint
  /** Value to attach: max(0, debt + rent − balance) + gas reserve. */
  amount: bigint
  monthlyRent: bigint
}

export function unfreezeCost(
  s: Pick<AccountSnapshot, 'balance' | 'storage'>,
  restored: Cell,
  prices: StoragePrices,
  opts: { masterchain: boolean, months: number, now?: number }
): UnfreezeCost {
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const st = s.storage
  const debt = st ? st.duePayment + storageFee(prices, now - st.lastPaid, opts.masterchain, st.cells, st.bits) : 0n
  const { cells, bits } = cellStats(restored)
  const monthlyRent = storageFee(prices, MONTH, opts.masterchain, cells, bits)
  const rent = monthlyRent * BigInt(opts.months)
  const short = debt + rent - s.balance
  return { debt, rent, monthlyRent, amount: (short > 0n ? short : 0n) + GAS_RESERVE }
}

/** Non-bounceable form of the address: the credit phase must run before the storage phase so the debt gets paid. */
export function unfreezeDestination(address: string, testOnly: boolean): string {
  return Address.parse(address).toString({ bounceable: false, testOnly, urlSafe: true })
}


// ---------------------------------------------------------------- dry run in the TVM emulator

/** The internal message a wallet would deliver: non-bounceable, `value`, the StateInit, empty body. */
export function unfreezeMessage(from: string, to: string, value: bigint, stateInit: StateInit, createdAt: number): Cell {
  return beginCell().store(storeMessage({
    info: {
      type: 'internal', ihrDisabled: true, bounce: false, bounced: false,
      src: Address.parse(from), dest: Address.parse(to), value: { coins: value },
      ihrFee: 0n, forwardFee: 0n, createdLt: 0n, createdAt
    },
    init: stateInit,
    body: Cell.EMPTY
  })).endCell()
}

export interface DryRun {
  /** Account status after the emulated transaction. */
  status: AccountSnapshot['status']
  balance: bigint
  duePayment: bigint
  codeHash: string | null
  aborted: boolean
  exitCode: number | null
}

/** Reads @ton/sandbox runTransaction output (base64 BOCs). */
export function readDryRun(res: { result: { success: true, transaction: string, shardAccount: string } | { success: false, error: string } }): DryRun {
  if (!res.result.success) throw new Error(`Emulator error: ${res.result.error}`)
  const tx = loadTransaction(Cell.fromBase64(res.result.transaction).beginParse())
  const after = parseShardAccount(res.result.shardAccount)
  const d = tx.description
  const cp = d.type === 'generic' ? d.computePhase : null
  return {
    status: after.status,
    balance: after.balance,
    duePayment: after.storage?.duePayment ?? 0n,
    codeHash: after.codeHash,
    aborted: d.type === 'generic' ? d.aborted : false,
    exitCode: cp && cp.type === 'vm' ? cp.exitCode : null
  }
}
