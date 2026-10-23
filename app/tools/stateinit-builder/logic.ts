// StateInit (TL-B: fixed_prefix_length:(Maybe ## 5) special:(Maybe TickTock) code:(Maybe ^Cell) data:(Maybe ^Cell)
// library:(HashmapE 256 SimpleLib)) builder and decoder. The address of a contract is hash(StateInit cell).
import type { Cell, StateInit } from '@ton/core'
import type { DictionaryValue, SimpleLibrary } from '@ton/core'
import { Address, beginCell, CellType, Dictionary, loadMessage, loadMessageRelaxed, loadSimpleLibrary, loadStateInit, storeSimpleLibrary, storeStateInit } from '@ton/core'
import { hashHex, parseCell, parseHash, toB64, toHex } from '~/lib/boc-advanced/cells'
import { detectWalletVersion } from '~/utils/ton/wallets'

export interface CellSummary {
  boc: string
  hash: string
  bits: number
  refs: number
  /** Code is a library reference (exotic type 2): the hash of the library cell the chain loads. */
  library?: string
  wallet?: string
}

export interface WalletData { seqno: number, walletId: number, publicKey: string }

export interface LibraryEntry { hash: string, public: boolean, boc: string }

export interface StateInitInfo {
  /** Where the StateInit came from. */
  source: 'stateinit' | 'external message' | 'internal message'
  /** Message destination, if it came from a message. */
  destination?: string
  boc: string
  bocHex: string
  /** hash(StateInit) = the account id. */
  hash: string
  workchain: number
  address: { raw: string, bounceable: string, nonBounceable: string, testnetBounceable: string, testnetNonBounceable: string }
  fixedPrefixLength: number | null
  special: { tick: boolean, tock: boolean } | null
  code: CellSummary | null
  data: CellSummary | null
  walletData?: WalletData
  libraries: LibraryEntry[]
}

function summarize(c: Cell): CellSummary {
  const s: CellSummary = { boc: toB64(c), hash: hashHex(c), bits: c.bits.length, refs: c.refs.length }
  if (c.type === CellType.Library) s.library = c.beginParse(true).skip(8).loadBuffer(32).toString('hex')
  const w = detectWalletVersion(s.hash) ?? (s.library ? detectWalletVersion(s.library) : null)
  if (w) s.wallet = w.label
  return s
}

/** seqno / wallet id / public key of standard v3, v4 and W5 wallets. */
function walletData(version: string | undefined, data: Cell): WalletData | undefined {
  try {
    const s = data.beginParse()
    if (version?.startsWith('Wallet v3') || version?.startsWith('Wallet v4')) {
      return { seqno: s.loadUint(32), walletId: s.loadUint(32), publicKey: s.loadBuffer(32).toString('hex') }
    }
    if (version === 'Wallet W5 (v5R1)') {
      s.skip(1)
      return { seqno: s.loadUint(32), walletId: s.loadUint(32), publicKey: s.loadBuffer(32).toString('hex') }
    }
  }
  catch { /* not the expected layout */ }
  return undefined
}

function inspect(init: StateInit, workchain: number, source: StateInitInfo['source'], destination?: Address): StateInitInfo {
  const cell = beginCell().store(storeStateInit(init)).endCell()
  const a = new Address(workchain, cell.hash())
  const code = init.code ? summarize(init.code) : null
  return {
    source,
    destination: destination?.toRawString(),
    boc: toB64(cell),
    bocHex: toHex(cell),
    hash: hashHex(cell),
    workchain,
    address: {
      raw: a.toRawString(),
      bounceable: a.toString({ bounceable: true }),
      nonBounceable: a.toString({ bounceable: false }),
      testnetBounceable: a.toString({ bounceable: true, testOnly: true }),
      testnetNonBounceable: a.toString({ bounceable: false, testOnly: true })
    },
    fixedPrefixLength: init.splitDepth ?? null,
    special: init.special ?? null,
    code,
    data: init.data ? summarize(init.data) : null,
    walletData: init.data ? walletData(code?.wallet, init.data) : undefined,
    libraries: init.libraries
      ? [...init.libraries].map(([k, v]) => ({ hash: k.toString(16).padStart(64, '0'), public: v.public, boc: toB64(v.root) }))
      : []
  }
}

// @ton/core does not export its SimpleLibraryValue
const SimpleLibraryValue: DictionaryValue<SimpleLibrary> = { serialize: (v, b) => b.store(storeSimpleLibrary(v)), parse: loadSimpleLibrary }

/** A message's inline body is the rest of the cell, so only a StateInit must be read to the end. */
const tryRead = <T>(cell: Cell, load: (s: ReturnType<Cell['beginParse']>) => T, whole: boolean): T | null => {
  try {
    const s = cell.beginParse()
    const v = load(s)
    return whole && (s.remainingBits || s.remainingRefs) ? null : v
  }
  catch {
    return null
  }
}

/** Reads a StateInit BOC, or the init of a message BOC (a deploy's external or internal message). */
export function decodeStateInit(input: string, workchain = 0): StateInitInfo {
  const cell = parseCell(input, 'StateInit or message BOC')
  const init = tryRead(cell, loadStateInit, true)
  if (init) return inspect(init, workchain, 'stateinit')
  const msg = tryRead(cell, loadMessage, false) ?? tryRead(cell, loadMessageRelaxed, false)
  if (msg) {
    if (!msg.init) throw new Error('This is a message, but it carries no StateInit (it is not a deploy).')
    const dest = msg.info.dest instanceof Address ? msg.info.dest : undefined
    return inspect(msg.init, dest?.workChain ?? workchain, msg.info.type === 'external-in' ? 'external message' : 'internal message', dest)
  }
  throw new Error('This BOC is neither a StateInit nor a message with one.')
}

export interface BuildInput {
  /** Code BOC, or (with codeIsLibrary) a 32-byte library hash. Empty = no code. */
  code: string
  codeIsLibrary?: boolean
  /** Data BOC. Empty = no data. */
  data: string
  fixedPrefixLength?: number | null
  tick?: boolean
  tock?: boolean
  libraries?: { boc: string, public: boolean }[]
  workchain?: number
}

/** A BOC string, or a Blueprint build JSON ({"hex": "b5ee9c72…"}). */
function bocOrBlueprint(input: string, what: string): Cell {
  const t = input.trim()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { hex?: unknown, boc?: unknown }
      const v = typeof j.hex === 'string' ? j.hex : j.boc
      if (typeof v === 'string') return parseCell(v, what)
    }
    catch { /* fall through */ }
  }
  return parseCell(t, what)
}

/** Library reference cell (exotic type 2): what the chain replaces with the library of that hash. */
export function libraryRefCell(hash: string): Cell {
  return beginCell().storeUint(CellType.Library, 8).storeBuffer(parseHash(hash)).endCell({ exotic: true })
}

export function buildStateInit(i: BuildInput): StateInitInfo {
  const wc = i.workchain ?? 0
  if (wc !== 0 && wc !== -1) throw new Error('Workchain must be 0 (basechain) or -1 (masterchain).')
  const init: StateInit = {}
  if (i.code.trim()) init.code = i.codeIsLibrary ? libraryRefCell(i.code) : bocOrBlueprint(i.code, 'Code')
  if (i.data.trim()) init.data = bocOrBlueprint(i.data, 'Data')
  if (i.fixedPrefixLength !== null && i.fixedPrefixLength !== undefined) {
    if (!Number.isInteger(i.fixedPrefixLength) || i.fixedPrefixLength < 0 || i.fixedPrefixLength > 31) throw new Error('fixed_prefix_length is 5 bits: 0 to 31.')
    init.splitDepth = i.fixedPrefixLength
  }
  if (i.tick || i.tock) init.special = { tick: !!i.tick, tock: !!i.tock }
  const libs = (i.libraries ?? []).filter(l => l.boc.trim())
  if (libs.length) {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), SimpleLibraryValue)
    libs.forEach((l, n) => {
      const root = parseCell(l.boc, `Library ${n + 1}`)
      const key = BigInt(`0x${hashHex(root)}`)
      if (dict.has(key)) throw new Error(`Library ${n + 1} is a duplicate`)
      dict.set(key, { public: l.public, root })
    })
    init.libraries = dict
  }
  if (!init.code) throw new Error('A StateInit needs code to deploy a contract. Paste the code BOC (or a library hash).')
  return inspect(init, wc, 'stateinit')
}

/** The message a wallet sends to deploy it, in TonConnect sendTransaction form. */
export function tonConnectMessage(info: StateInitInfo, amountNano: string, testnet = false) {
  return { address: testnet ? info.address.testnetBounceable : info.address.bounceable, amount: amountNano, stateInit: info.boc }
}
