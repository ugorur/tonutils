// Transaction re-tracer: re-executes a historical transaction in the local TVM emulator (@ton/sandbox) on the
// account state from just before its block, and turns the VM log into instruction-level steps.
import type { Cell } from '@ton/core'
import { beginCell, CellType, Dictionary, loadShardAccount, loadTransaction } from '@ton/core'
import type { EmulationResult } from '@ton/sandbox/dist/executor/Executor'
import type { RawTransactionArgs } from '~/utils/lazy/sandbox.worker'
import { findTransaction, rawTransactions, type ToncenterLike } from '~/lib/tx-dev/lookup'
import { txFromBoc, type TxView, type V3Tx } from '~/lib/tx-dev/txview'
import { parseBoc } from '~/utils/ton/messages'

// ---------------------------------------------------------------- inputs

/** last_trans_lt of a ShardAccount BOC (the state snapshot): transactions after it must be replayed first. */
export function stateLt(shardAccountB64: string): bigint {
  return loadShardAccount(parseBoc(shardAccountB64).beginParse()).lastTransactionLt
}

/** Code cell of the account in a ShardAccount, or null (uninit / nonexistent / frozen). */
export function stateCode(shardAccountB64: string): Cell | null {
  const st = loadShardAccount(parseBoc(shardAccountB64).beginParse()).account?.storage.state
  return st?.type === 'active' ? st.state.code ?? null : null
}

/** Inbound message cell of a raw transaction (null for tick-tock). */
export function inMessage(txB64: string): Cell | null {
  const c = parseBoc(txB64)
  const io = c.refs[0]!.beginParse()
  return io.loadBit() ? io.loadRef() : null
}

/** StateInit code carried by the inbound message, if any. */
function inMessageCode(txB64: string): Cell | null {
  return loadTransaction(parseBoc(txB64).beginParse()).inMessage?.init?.code ?? null
}

/** Hashes (hex) of library cells referenced anywhere in the given cells: the emulator needs their content. */
export function libraryHashes(cells: (Cell | null)[]): string[] {
  const seen = new Set<string>()
  const out = new Set<string>()
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    if (c.type === CellType.Library) out.add(c.bits.substring(8, 256).toString().toLowerCase())
    c.refs.forEach(walk)
  }
  cells.forEach(c => c && walk(c))
  return [...out]
}

/** Every library a replay needs: account code plus StateInit code of each inbound message. */
export function neededLibraries(shardAccountB64: string, txs: string[]): string[] {
  return libraryHashes([stateCode(shardAccountB64), ...txs.map(inMessageCode)])
}

/** Libraries dictionary (hash → ^Cell) BOC for the emulator, from toncenter getLibraries entries. */
export function libsDict(entries: { hash: string, data: string }[]): string | undefined {
  if (!entries.length) return undefined
  const d = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
  for (const e of entries) d.set(Buffer.from(e.hash, 'base64'), parseBoc(e.data))
  return beginCell().storeDictDirect(d).endCell().toBoc().toString('base64')
}

export interface RawTx { lt: bigint, raw: string }

/**
 * The transactions to run, oldest first: every transaction after the snapshot up to and including the target.
 * `fetched` is newest first (toncenter getTransactions order) and must reach back to the snapshot.
 */
export function replayPlan(fetched: RawTx[], snapshotLt: bigint, targetLt: bigint): string[] {
  const list = fetched.filter(t => t.lt > snapshotLt && t.lt <= targetLt).sort((a, b) => (a.lt < b.lt ? -1 : 1))
  if (!list.length || list.at(-1)!.lt !== targetLt) throw new Error('The target transaction is not in the fetched list.')
  const first = loadTransaction(parseBoc(list[0]!.raw).beginParse())
  if (first.prevTransactionLt !== snapshotLt) throw new Error('Could not fetch every transaction between the state snapshot and the target.')
  return list.map(t => t.raw)
}

// ---------------------------------------------------------------- fetch everything a replay needs

export interface Fetched extends Omit<RetraceInput, 'onStep'> {
  /** The indexed transaction (toncenter v3). */
  indexed: V3Tx
  viaMessage: boolean
  mcSeqno: number
  libraryCount: number
}

const PAGE = 16
const MAX_PAGES = 5

/**
 * toncenter calls: v3 transaction lookup, v2 getShardAccountCell at the previous masterchain block,
 * v2 getTransactions (pages back to the snapshot), v2 getConfigAll at the block, v2 getLibraries if needed.
 */
export async function fetchRetraceInputs(tc: ToncenterLike, hashB64: string, network: string, onStage: (s: string) => void = () => {}): Promise<Fetched> {
  onStage('Finding the transaction')
  const found = await findTransaction(tc, hashB64)
  if (!found) throw new Error(`No transaction or inbound message with this hash on ${network}. Check the network switch in the header.`)
  const t = found.tx
  if (!t.in_msg) throw new Error('This is a tick-tock transaction (no inbound message): it cannot be re-traced here yet.')
  const mc = t.mc_block_seqno
  if (!mc) throw new Error('This transaction is not in a masterchain block yet. Try again in a few seconds.')

  onStage(`Reading the account state at masterchain block ${mc - 1}`)
  const state = (await tc.v2<{ bytes: string }>('getShardAccountCell', { address: t.account, seqno: mc - 1 })).bytes
  const snap = stateLt(state)

  onStage('Fetching the transaction and any earlier ones in the same block')
  const fetched: RawTx[] = []
  let cursor = { lt: t.lt, hash: t.hash }
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await rawTransactions(tc, t.account, cursor.lt, cursor.hash, PAGE)
    fetched.push(...list)
    const oldest = list.at(-1)
    if (!oldest || oldest.lt <= snap) break
    const tx = loadTransaction(parseBoc(oldest.raw).beginParse())
    if (tx.prevTransactionLt <= snap || list.length < PAGE) break
    cursor = { lt: tx.prevTransactionLt.toString(), hash: Buffer.from(tx.prevTransactionHash.toString(16).padStart(64, '0'), 'hex').toString('base64') }
  }
  const txs = replayPlan(dedupe(fetched), snap, BigInt(t.lt))

  onStage(`Reading the blockchain config of block ${mc}`)
  const config = (await tc.v2<{ config: { bytes: string } }>('getConfigAll', { seqno: mc })).config.bytes

  const needed = neededLibraries(state, txs)
  let libs: string | undefined
  if (needed.length) {
    onStage(`Fetching ${needed.length} library cell${needed.length > 1 ? 's' : ''}`)
    const entries: { hash: string, data: string }[] = []
    for (const h of needed) entries.push(...(await tc.v2<{ result: { hash: string, data: string }[] }>('getLibraries', { libraries: h })).result)
    libs = libsDict(entries)
  }
  return { indexed: t, viaMessage: found.viaMessage, mcSeqno: mc, state, txs, config, libs, libraryCount: needed.length }
}

const dedupe = (l: RawTx[]) => [...new Map(l.map(t => [t.lt, t])).values()]

// ---------------------------------------------------------------- run

export type RunTx = (a: RawTransactionArgs) => Promise<EmulationResult>

export interface RetraceInput {
  /** ShardAccount BOC (base64) at the snapshot. */
  state: string
  /** Raw transaction BOCs, oldest first; the last one is the target. */
  txs: string[]
  /** Blockchain config BOC (base64) of the transaction's masterchain block. */
  config: string
  libs?: string
  /** Optional progress callback: index of the transaction being run. */
  onStep?: (i: number, total: number) => void
}

export interface RetraceResult {
  /** The re-executed target transaction. */
  tx: TxView
  originalHash: string
  emulatedHash: string
  /** Bit-exact: same transaction hash as on chain. */
  match: boolean
  /** Earlier transactions replayed to reach the target's starting state; mismatches among them. */
  replayed: number
  replayMismatches: number
  vmLog: string
  /** Emulator log (fees, gas limits, phases). */
  logs: string
}

export async function retrace(input: RetraceInput, run: RunTx): Promise<RetraceResult> {
  let state = input.state
  let mismatches = 0
  for (let i = 0; i < input.txs.length; i++) {
    input.onStep?.(i, input.txs.length)
    const raw = input.txs[i]!
    const isTarget = i === input.txs.length - 1
    const cell = parseBoc(raw)
    const tx = loadTransaction(cell.beginParse())
    const msg = inMessage(raw)
    if (!msg) throw new Error('Tick-tock transactions (no inbound message) cannot be re-traced here yet.')
    const r = await run({
      shardAccount: state,
      message: msg.toBoc().toString('base64'),
      now: tx.now,
      lt: tx.lt.toString(),
      config: input.config,
      libs: input.libs,
      verbosity: isTarget ? 'full_location_stack' : 'short'
    })
    if (!r.result.success) throw new Error(`The emulator could not run ${isTarget ? 'the transaction' : `earlier transaction lt ${tx.lt}`}: ${r.result.error}`)
    const out = parseBoc(r.result.transaction)
    const same = out.hash().equals(cell.hash())
    if (!isTarget) {
      if (!same) mismatches++
      state = r.result.shardAccount
      continue
    }
    return {
      tx: txFromBoc(out),
      originalHash: cell.hash().toString('hex'),
      emulatedHash: out.hash().toString('hex'),
      match: same,
      replayed: input.txs.length - 1,
      replayMismatches: mismatches,
      vmLog: r.result.vmLog,
      logs: r.logs
    }
  }
  throw new Error('Nothing to run.')
}

// ---------------------------------------------------------------- VM log → steps

export interface Step {
  n: number
  instr: string
  /** Code cell hash (hex) and bit offset of the instruction. */
  cell: string
  offset: number
  /** Gas used so far after this instruction, and this instruction's cost. */
  gasUsed: number
  cost: number
  /** Stack before the instruction, bottom first (the last element is the top). */
  stack: string[]
  /** Other VM messages printed after this instruction (exceptions, gas limit changes, implicit jumps). */
  notes: string[]
}

/** Splits a VM stack dump `[ 1 C{…} [ 2 3 ] ]` into its top-level elements. */
export function splitStack(s: string): string[] {
  const inner = s.trim().replace(/^\[\s*/, '').replace(/\s*\]$/, '')
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    if (ch === ' ' && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    }
    else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Parses a `full_location_stack` VM log. `initialGas` is gas_limit + gas_credit of the compute phase
 * (the VM's starting limit); ACCEPT raises it, which the log reports as "changing gas limit to N".
 */
export function parseVmLog(log: string, initialGas: number): Step[] {
  const steps: Step[] = []
  let limit = initialGas
  let prevUsed = 0
  let stack: string[] = []
  let loc = { cell: '', offset: 0 }
  let cur: Step | null = null
  for (const line of log.split('\n')) {
    let m: RegExpExecArray | null
    if (line.startsWith('stack: ')) {
      stack = splitStack(line.slice(7))
    }
    else if ((m = /^code cell hash: ([0-9A-F]+) offset: (\d+)/i.exec(line))) {
      loc = { cell: m[1]!.toLowerCase(), offset: Number(m[2]) }
    }
    else if (line.startsWith('execute ')) {
      cur = { n: steps.length + 1, instr: line.slice(8).trim(), ...loc, gasUsed: prevUsed, cost: 0, stack, notes: [] }
      steps.push(cur)
    }
    else if ((m = /^gas remaining: (-?\d+)/.exec(line))) {
      if (!cur) continue
      cur.gasUsed = limit - Number(m[1])
      cur.cost = cur.gasUsed - prevUsed
      prevUsed = cur.gasUsed
    }
    else if (line.trim()) {
      if ((m = /^changing gas limit to (\d+)/.exec(line))) limit = Number(m[1])
      cur?.notes.push(line.trim())
    }
  }
  return steps
}
