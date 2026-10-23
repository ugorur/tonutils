// Contract data parsers shared by the wallet-detection tools (detector, highload v3, vesting).
// Pure TS on @ton/core: import from logic.ts / Tool.vue only.
import type { Address } from '@ton/core'
import { Cell, CellType, Dictionary } from '@ton/core'
import type { WalletKind } from '~/utils/ton/wallets'
import { detectWalletVersion } from '~/utils/ton/wallets'

const hex = (b: Buffer) => b.toString('hex')

// ---------------------------------------------------------------- highload wallet v3
// storage$_ public_key:bits256 subwallet_id:uint32 old_queries:(HashmapE 13 ^Cell)
//           queries:(HashmapE 13 ^Cell) last_clean_time:uint64 timeout:uint22 = Storage;
// (ton-blockchain/highload-wallet-contract-v3 contracts/scheme.tlb)

export interface HighloadV3State {
  publicKey: string
  subwalletId: number
  oldQueries: Dictionary<number, Cell>
  queries: Dictionary<number, Cell>
  lastCleanTime: number
  timeout: number
}

export function parseHighloadV3Data(data: Cell): HighloadV3State {
  const s = data.beginParse()
  const publicKey = hex(s.loadBuffer(32))
  const subwalletId = s.loadUint(32)
  const oldQueries = s.loadDict(Dictionary.Keys.Uint(13), Dictionary.Values.Cell())
  const queries = s.loadDict(Dictionary.Keys.Uint(13), Dictionary.Values.Cell())
  const lastCleanTime = Number(s.loadUintBig(64))
  const timeout = s.loadUint(22)
  return { publicKey, subwalletId, oldQueries, queries, lastCleanTime, timeout }
}

function bitSet(d: Dictionary<number, Cell>, shift: number, bit: number): boolean {
  const c = d.get(shift)
  return !!c && bit < c.bits.length && c.bits.at(bit)
}

/**
 * Same answer as the contract's `processed?(query_id, need_clean)` getter. Pass `now` (unix seconds) for
 * need_clean = true, which drops windows the next external message would clean.
 */
export function highloadProcessed(st: HighloadV3State, queryId: number, now?: number): boolean {
  const shift = queryId >> 10
  const bit = queryId & 1023
  let { oldQueries, queries } = st
  const empty = Dictionary.empty(Dictionary.Keys.Uint(13), Dictionary.Values.Cell())
  if (now !== undefined && st.lastCleanTime < now - st.timeout) {
    oldQueries = st.lastCleanTime < now - st.timeout * 2 ? empty : queries
    queries = empty
  }
  return bitSet(oldQueries, shift, bit) || bitSet(queries, shift, bit)
}

/** Every query id marked in a window, ascending. */
export function usedQueryIds(d: Dictionary<number, Cell>): number[] {
  const out: number[] = []
  for (const shift of d.keys().sort((a, b) => a - b)) {
    const bits = d.get(shift)!.bits
    for (let i = 0; i < bits.length; i++) if (bits.at(i)) out.push((shift << 10) + i)
  }
  return out
}

// ---------------------------------------------------------------- vesting wallet
// seqno:uint32 subwallet:uint32 public_key:uint256 whitelist:(HashmapE 264 int1) ^[start:uint64 total_duration:uint32
// unlock_period:uint32 cliff:uint32 total_amount:Coins sender:MsgAddress owner:MsgAddress]
// (ton-blockchain/vesting-contract contracts/vesting_wallet.fc load_data)

export interface VestingParams {
  startTime: number
  totalDuration: number
  unlockPeriod: number
  cliffDuration: number
  totalAmount: bigint
}

export interface VestingState extends VestingParams {
  seqno: number
  subwalletId: number
  publicKey: string
  /** Raw 0:hex / -1:hex addresses the locked funds may also go to. */
  whitelist: string[]
  sender: Address | null
  owner: Address | null
}

export function parseVestingData(data: Cell): VestingState {
  const s = data.beginParse()
  const seqno = s.loadUint(32)
  const subwalletId = s.loadUint(32)
  const publicKey = hex(s.loadBuffer(32))
  const wl = s.loadMaybeRef()
  const whitelist: string[] = []
  if (wl) {
    // Keys are wc:int8 ++ hash:uint256; read them as 264-bit buffers to keep the signed workchain.
    const d = Dictionary.loadDirect(Dictionary.Keys.Buffer(33), Dictionary.Values.Bool(), wl)
    for (const k of d.keys()) whitelist.push(`${k.readInt8(0)}:${hex(k.subarray(1))}`)
  }
  const p = s.loadRef().beginParse()
  return {
    seqno,
    subwalletId,
    publicKey,
    whitelist,
    startTime: Number(p.loadUintBig(64)),
    totalDuration: p.loadUint(32),
    unlockPeriod: p.loadUint(32),
    cliffDuration: p.loadUint(32),
    totalAmount: p.loadCoins(),
    sender: p.loadMaybeAddress(),
    owner: p.loadMaybeAddress()
  }
}

/** The contract's `get_locked_amount(at)`: muldiv floors, periods are whole. */
export function vestingLockedAmount(v: VestingParams, at: number): bigint {
  if (at > v.startTime + v.totalDuration) return 0n
  if (at < v.startTime + v.cliffDuration) return v.totalAmount
  const passed = BigInt(Math.floor((at - v.startTime) / v.unlockPeriod))
  const periods = BigInt(Math.floor(v.totalDuration / v.unlockPeriod))
  return v.totalAmount - (v.totalAmount * passed) / periods
}

// ---------------------------------------------------------------- wallet data (all versions in WALLET_CODE_HASHES)

export interface DataField {
  label: string
  value: string
  hint?: string
  mono?: boolean
}

export interface WalletData {
  publicKey: string | null
  seqno: number | null
  fields: DataField[]
}

/** Any-value parser for dicts whose values carry no data (v4 plugins: empty, W5 extensions: int1). */
const PRESENT = { serialize: () => {}, parse: () => true }

/** W5 v5r1 wallet_id = network_global_id XOR context (WalletV5R1WalletId in @ton/ton). */
export function decodeW5WalletId(walletId: number, prefer: 'mainnet' | 'testnet' = 'mainnet'): { network: 'mainnet' | 'testnet', networkGlobalId: number, text: string } | null {
  // Mainnet subwallet n and testnet subwallet n ^ 236 share an id, so try the network being viewed first.
  const ids = [['mainnet', -239], ['testnet', -3]] as const
  for (const [network, id] of prefer === 'mainnet' ? ids : [ids[1], ids[0]]) {
    const ctx = (walletId ^ id) >>> 0
    if (ctx >>> 31) {
      // client context: 1 bit flag, workchain int8, version uint8 (0 = v5r1), subwallet uint15
      const workchain = ((ctx >>> 23) & 0xff) << 24 >> 24
      const version = (ctx >>> 15) & 0xff
      if (version !== 0 || (workchain !== 0 && workchain !== -1)) continue
      return { network, networkGlobalId: id, text: `${network} (${id}), workchain ${workchain}, subwallet ${ctx & 0x7fff}` }
    }
  }
  return null
}

const hashList = (keys: Buffer[], wcFromKey: boolean, wc: number) =>
  keys.map(k => (wcFromKey ? `${k.readInt8(0)}:${hex(k.subarray(1))}` : `${wc}:${hex(k)}`))

/**
 * Parses a wallet contract's persistent data for a version from WALLET_CODE_HASHES.
 * Layouts: ton-blockchain/wallet-contract (v1–v4), wallet-contract-v5, @ton/ton W5 beta,
 * highload-wallet-contract(-v3), vesting-contract. Throws on data that does not match; versions without
 * a layout here (multisig-v2, preprocessed-v2) return no fields.
 */
export function parseWalletData(version: string, data: Cell, opts: { workchain?: number, testOnly?: boolean } = {}): WalletData {
  const workchain = opts.workchain ?? 0
  const s = data.beginParse()
  const f: DataField[] = []
  let seqno: number | null = null
  let publicKey: string | null = null
  const key = () => (publicKey = hex(s.loadBuffer(32)))

  switch (version) {
    case 'v1r1': case 'v1r2': case 'v1r3': case 'v2r1': case 'v2r2':
      seqno = s.loadUint(32)
      key()
      break
    case 'v3r1': case 'v3r2': case 'v4r1': case 'v4r2': {
      seqno = s.loadUint(32)
      const sub = s.loadUint(32)
      f.push({ label: 'Subwallet id', value: String(sub), hint: sub === 698983191 ? 'Default (698983191 = 0x29a9a317)' : 'Non-default: wallet apps derive a different address for this key' })
      key()
      if (version.startsWith('v4')) {
        const plugins = s.loadDict(Dictionary.Keys.Buffer(33), PRESENT)
        f.push({ label: 'Plugins', value: plugins.size ? hashList(plugins.keys(), true, workchain).join('\n') : 'None', hint: 'Plugins (e.g. subscriptions) may withdraw from this wallet', mono: plugins.size > 0 })
      }
      break
    }
    case 'v5r1': {
      const allowed = s.loadBit()
      seqno = s.loadUint(32)
      const walletId = s.loadUint(32)
      const ctx = decodeW5WalletId(walletId, opts.testOnly ? 'testnet' : 'mainnet')
      f.push({ label: 'Signature allowed', value: allowed ? 'Yes' : 'No', hint: allowed ? 'The key can sign transfers' : 'Only extensions can control this wallet', mono: false })
      f.push({ label: 'Wallet id', value: String(walletId), hint: ctx ? `Decodes to ${ctx.text}` : 'Custom wallet id' })
      key()
      const ext = s.loadDict(Dictionary.Keys.Buffer(32), PRESENT)
      f.push({ label: 'Extensions', value: ext.size ? hashList(ext.keys(), false, workchain).join('\n') : 'None', hint: 'Extensions can send from this wallet without a signature', mono: ext.size > 0 })
      break
    }
    case 'v5beta': {
      seqno = Number(s.loadIntBig(33))
      const net = s.loadInt(32)
      const wc = s.loadInt(8)
      s.loadUint(8)
      const sub = s.loadUint(32)
      f.push({ label: 'Wallet id', value: `network ${net} (${net === -239 ? 'mainnet' : net === -3 ? 'testnet' : 'custom'}), workchain ${wc}, subwallet ${sub}`, mono: false })
      key()
      const ext = s.loadDict(Dictionary.Keys.Buffer(32), PRESENT)
      f.push({ label: 'Extensions', value: ext.size ? hashList(ext.keys(), false, workchain).join('\n') : 'None', mono: ext.size > 0 })
      break
    }
    case 'highload-v2': case 'highload-v2r1': case 'highload-v2r2': {
      f.push({ label: 'Subwallet id', value: String(s.loadUint(32)) })
      // last_cleaned is a query id: (valid_until << 32) | n
      f.push({ label: 'Last cleaned', value: new Date(Number(s.loadUintBig(64) >> 32n) * 1000).toISOString(), mono: false })
      key()
      break
    }
    case 'highload-v3': {
      const h = parseHighloadV3Data(data)
      publicKey = h.publicKey
      f.push({ label: 'Subwallet id', value: String(h.subwalletId) })
      f.push({ label: 'Timeout', value: `${h.timeout} s`, hint: 'Messages older than this are rejected; query ids are forgotten after 2× timeout' })
      f.push({ label: 'Last clean', value: new Date(h.lastCleanTime * 1000).toISOString(), mono: false })
      break
    }
    case 'vesting': {
      const v = parseVestingData(data)
      seqno = v.seqno
      publicKey = v.publicKey
      f.push({ label: 'Subwallet id', value: String(v.subwalletId) })
      f.push({ label: 'Vesting owner', value: v.owner?.toString({ bounceable: false, testOnly: opts.testOnly }) ?? 'none' })
      break
    }
    default:
      // multisig-v2 has its own viewer; preprocessed-v2: no verified layout. Show no data rather than an error.
      return { publicKey: null, seqno: null, fields: [] }
  }
  if (publicKey) f.unshift({ label: 'Public key', value: publicKey })
  if (seqno !== null) f.unshift({ label: 'Seqno', value: String(seqno), hint: 'Number of transfers signed so far', mono: true })
  return { publicKey, seqno, fields: f }
}

// ---------------------------------------------------------------- code inspection

export interface CodeInfo {
  hashHex: string
  hashBase64: string
  /** For library-cell code: hash of the library the account runs. */
  libraryHashHex: string | null
  wallet: WalletKind | null
}

export function inspectCode(code: Cell): CodeInfo {
  const hash = code.hash()
  // A library cell is 8-bit tag + 256-bit hash of the real code; deployers use it to save storage fees.
  const libraryHashHex = code.type === CellType.Library ? code.bits.substring(8, 256).toString().toLowerCase() : null
  return {
    hashHex: hash.toString('hex'),
    hashBase64: hash.toString('base64'),
    libraryHashHex,
    wallet: detectWalletVersion(hash.toString('hex')) ?? (libraryHashHex ? detectWalletVersion(libraryHashHex) : null)
  }
}

export function inspectHash(hashHex: string): CodeInfo {
  return { hashHex, hashBase64: Buffer.from(hashHex, 'hex').toString('base64'), libraryHashHex: null, wallet: detectWalletVersion(hashHex) }
}

export interface AccountReport extends CodeInfo {
  data: WalletData | null
  dataError: string | null
}

/** code/data: base64 BOCs from toncenter /api/v3/account. */
export function inspectAccount(code: string, data: string | null, opts: { workchain: number, testOnly: boolean }): AccountReport {
  const info = inspectCode(Cell.fromBase64(code))
  let parsed: WalletData | null = null
  let dataError: string | null = null
  if (info.wallet && data) {
    try {
      parsed = parseWalletData(info.wallet.version, Cell.fromBase64(data), opts)
    }
    catch (e) {
      dataError = (e as Error).message
    }
  }
  return { ...info, data: parsed, dataError }
}
