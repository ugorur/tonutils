// Account state at any masterchain block: fetch (toncenter v2 liteserver calls), parse and resolve libraries.
// Shared by historical-state-viewer and unfreeze-account. Pure TS + @ton/core (client / vitest only).
import { beginCell, Cell, CellType, Dictionary, loadShardAccount, storeStateInit } from '@ton/core'
import type { StateInit } from '@ton/core'

import type { V2Fetch } from '~/utils/api-client'

export type { Query, V2Fetch, V3Fetch } from '~/utils/api-client'

export type AccountStatus = 'nonexist' | 'uninit' | 'active' | 'frozen'

export interface AccountSnapshot {
  status: AccountStatus
  /** nanoGRAM. */
  balance: bigint
  /** Last transaction of the account at that block ('0' / '' when none). */
  lastTxLt: string
  lastTxHash: string
  /** Storage stats; null for a non-existent account. */
  storage: { cells: bigint, bits: bigint, lastPaid: number, duePayment: bigint } | null
  /** Active accounts only. */
  stateInit: StateInit | null
  code: Cell | null
  data: Cell | null
  codeHash: string | null
  dataHash: string | null
  /** Hash of the StateInit: computed for active accounts, the stored frozen_hash for frozen ones (hex). */
  stateHash: string | null
}

const hex = (b: Buffer | bigint) => (typeof b === 'bigint' ? b.toString(16).padStart(64, '0') : b.toString('hex'))

export function stateInitCell(s: StateInit): Cell {
  return beginCell().store(storeStateInit(s)).endCell()
}

/** Parses a ShardAccount BOC (base64), as returned by toncenter v2 getShardAccountCell. */
export function parseShardAccount(boc: string): AccountSnapshot {
  const sa = loadShardAccount(Cell.fromBase64(boc).beginParse())
  const acc = sa.account
  const base = {
    lastTxLt: sa.lastTransactionLt.toString(),
    lastTxHash: sa.lastTransactionLt === 0n ? '' : hex(sa.lastTransactionHash),
    stateInit: null, code: null, data: null, codeHash: null, dataHash: null, stateHash: null
  }
  if (!acc) return { ...base, status: 'nonexist', balance: 0n, storage: null }
  const st = acc.storageStats
  const storage = { cells: st.used.cells, bits: st.used.bits, lastPaid: st.lastPaid, duePayment: st.duePayment ?? 0n }
  const common = { ...base, balance: acc.storage.balance.coins, storage }
  const s = acc.storage.state
  if (s.type === 'uninit') return { ...common, status: 'uninit' }
  if (s.type === 'frozen') return { ...common, status: 'frozen', stateHash: hex(s.stateHash) }
  const code = s.state.code ?? null
  const data = s.state.data ?? null
  return {
    ...common,
    status: 'active',
    stateInit: s.state,
    code,
    data,
    codeHash: code ? hex(code.hash()) : null,
    dataHash: data ? hex(data.hash()) : null,
    stateHash: hex(stateInitCell(s.state).hash())
  }
}

/** Account state at masterchain block `seqno` (latest when omitted). */
export async function fetchAccountAt(v2: V2Fetch, address: string, seqno?: number): Promise<AccountSnapshot> {
  const r = await v2<{ bytes: string }>('getShardAccountCell', { address, seqno })
  return parseShardAccount(r.bytes)
}

export interface McBlock { seqno: number, utime: number }
const MC = { workchain: -1, shard: '-9223372036854775808' }

export async function mcBlockBySeqno(v2: V2Fetch, seqno: number): Promise<McBlock> {
  const h = await v2<{ gen_utime: number }>('getBlockHeader', { ...MC, seqno })
  return { seqno, utime: h.gen_utime }
}

/** First masterchain block generated at or after `unixtime` (blocks are ~every 3 s, so this is "as of" that moment). */
export async function mcBlockAt(v2: V2Fetch, unixtime: number): Promise<McBlock> {
  const id = await v2<{ seqno: number }>('lookupBlock', { ...MC, unixtime })
  return mcBlockBySeqno(v2, id.seqno)
}

/** Hash (hex) of a library cell referenced by an exotic library cell, else null. */
export function libraryRef(c: Cell): string | null {
  if (c.type !== CellType.Library) return null
  return c.bits.substring(8, 256).toString().toLowerCase()
}

/** Downloads library cells (hex hashes) from the masterchain library store. */
export async function fetchLibraries(v2: V2Fetch, hashes: string[]): Promise<Map<string, Cell>> {
  const out = new Map<string, Cell>()
  for (const h of hashes) {
    const r = await v2<{ result: { hash: string, data: string }[] }>('getLibraries', { libraries: h.toLowerCase() })
    const lib = r.result[0]
    if (!lib?.data) throw new Error(`Library ${h} was not found on chain.`)
    out.set(h.toLowerCase(), Cell.fromBase64(lib.data))
  }
  return out
}

/** Libraries dictionary (uint256 hash -> ^Cell) in the shape the TVM emulator expects. */
export function libsDict(libs: Map<string, Cell>): Cell | undefined {
  if (!libs.size) return undefined
  const d = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  for (const [h, c] of libs) d.set(BigInt('0x' + h), c)
  return beginCell().storeDictDirect(d).endCell()
}
