import { Address, beginCell, Cell, loadStateInit, storeStateInit, type StateInit } from '@ton/core'
import { parseBoc } from '~/utils/ton/messages'

export interface StateInitResult {
  workchain: number
  raw: string
  bounceable: string
  nonBounceable: string
  testnetBounceable: string
  testnetNonBounceable: string
  /** The StateInit cell, base64 BOC (what goes into a deploy message's state_init). */
  stateInitBoc: string
  /** StateInit cell hash = the account id, hex. */
  stateInitHash: string
  codeHash: string | null
  dataHash: string | null
  splitDepth: number | null
  special: { tick: boolean, tock: boolean } | null
  libraries: number
}

function finish(cell: Cell, init: StateInit, workchain: number): StateInitResult {
  const a = new Address(workchain, cell.hash())
  return {
    workchain,
    raw: a.toRawString(),
    bounceable: a.toString({ bounceable: true, urlSafe: true }),
    nonBounceable: a.toString({ bounceable: false, urlSafe: true }),
    testnetBounceable: a.toString({ bounceable: true, testOnly: true, urlSafe: true }),
    testnetNonBounceable: a.toString({ bounceable: false, testOnly: true, urlSafe: true }),
    stateInitBoc: cell.toBoc().toString('base64'),
    stateInitHash: cell.hash().toString('hex'),
    codeHash: init.code?.hash().toString('hex') ?? null,
    dataHash: init.data?.hash().toString('hex') ?? null,
    splitDepth: init.splitDepth ?? null,
    special: init.special ?? null,
    libraries: init.libraries?.size ?? 0
  }
}

/** Accepts a BOC string or a Blueprint build JSON (`{ "hex": "b5ee9c72…" }`). */
function bocInput(s: string): string {
  const t = s.trim()
  if (!t.startsWith('{')) return t
  try {
    const j = JSON.parse(t) as { hex?: unknown, boc?: unknown }
    if (typeof j.hex === 'string') return j.hex
    if (typeof j.boc === 'string') return j.boc
  }
  catch { /* fall through to the BOC error */ }
  return t
}

function checkWorkchain(wc: number) {
  if (wc !== 0 && wc !== -1) throw new Error('Workchain must be 0 (basechain) or -1 (masterchain).')
}

/** Address of a full StateInit cell. The address hash is the hash of exactly this cell. */
export function fromStateInitBoc(boc: string, workchain = 0): StateInitResult {
  checkWorkchain(workchain)
  const cell = parseBoc(bocInput(boc))
  let init: StateInit
  try {
    const s = cell.beginParse()
    init = loadStateInit(s)
    if (s.remainingBits || s.remainingRefs) throw new Error('trailing data')
  }
  catch {
    throw new Error('This BOC is a cell, but not a StateInit. If you have the code and data separately, use the "Code + data" tab.')
  }
  if (!init.code) throw new Error('This StateInit has no code, so it cannot deploy a contract.')
  return finish(cell, init, workchain)
}

/** Address from separate code and data cells (split_depth, special and libraries empty, the usual case). */
export function fromCodeData(code: string, data: string, workchain = 0): StateInitResult {
  checkWorkchain(workchain)
  let codeCell: Cell
  try {
    codeCell = parseBoc(bocInput(code))
  }
  catch {
    throw new Error(code.trim() ? 'Code is not a valid BOC. Paste base64 (te6cc…) or hex (b5ee9c72…).' : 'Paste the contract code BOC.')
  }
  let dataCell: Cell
  try {
    dataCell = data.trim() ? parseBoc(bocInput(data)) : beginCell().endCell()
  }
  catch {
    throw new Error('Data is not a valid BOC. Paste base64 (te6cc…) or hex (b5ee9c72…), or leave it empty for an empty cell.')
  }
  const init: StateInit = { code: codeCell, data: dataCell }
  return finish(beginCell().store(storeStateInit(init)).endCell(), init, workchain)
}

/** Splits a StateInit BOC into its code and data BOCs (base64), for the code+data tab. */
export function splitStateInit(boc: string): { code: string, data: string } {
  const init = loadStateInit(parseBoc(boc).beginParse())
  return { code: init.code?.toBoc().toString('base64') ?? '', data: init.data?.toBoc().toString('base64') ?? '' }
}
