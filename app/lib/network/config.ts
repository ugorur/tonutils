// Blockchain config (ConfigParams) decoding for the network batch. Uses @ton/ton's parsers where they
// exist and follows the current block.tlb (github.com/ton-blockchain/ton crypto/block/block.tlb) for the rest.
// Client/logic only: imports @ton/*.
import { Address, Cell, Dictionary } from '@ton/core'
import type { Slice } from '@ton/core'
// Only what @ton/ton's index exports: a deep import of its dist files makes the Vite dev server re-optimize.
import {
  configParse12, configParse13, configParse15, configParse16, configParse17, configParse18, configParse28,
  configParse29, configParse40, configParse5, configParseBridge, configParseGasLimitsPrices, configParseMsgPrices,
  configParseValidatorSet, parseVotingSetup
} from '@ton/ton'
import { formatCoin } from '~/utils/currency'

export const CONFIG_ADDRESS = '-1:5555555555555555555555555555555555555555555555555555555555555555'
export const ELECTOR_ADDRESS = '-1:3333333333333333333333333333333333333333333333333333333333333333'

/** Name and one-line meaning of every ConfigParam defined in block.tlb. */
export const PARAM_INFO: Record<number, [string, string]> = {
  0: ['Config contract', 'Address of the smart contract that stores the config and runs the votes.'],
  1: ['Elector contract', 'Address of the contract that runs validator elections and holds stakes.'],
  2: ['Minter contract', 'Address that mints new coins (falls back to param 0).'],
  3: ['Fee collector', 'Address that receives transaction fees (falls back to param 1).'],
  4: ['Root DNS contract', 'Root resolver of TON DNS (.ton domains).'],
  5: ['Fee burning', 'Share of fees that is burned, and the black hole address.'],
  6: ['Extra currency mint prices', 'Price to create a new extra currency or mint more of one.'],
  7: ['Extra currencies to mint', 'Extra currency amounts the minter should hold.'],
  8: ['Global version', 'Network protocol version and enabled capabilities.'],
  9: ['Mandatory params', 'Params that must always be present in the config.'],
  10: ['Critical params', 'Params that need a critical (harder) vote to change.'],
  11: ['Voting setup', 'Rounds, wins and losses needed for normal and critical config proposals.'],
  12: ['Workchains', 'Workchains that exist on the network and their settings.'],
  13: ['Complaint pricing', 'Cost to file a complaint against a validator.'],
  14: ['Block rewards', 'Coins created for every masterchain and basechain block.'],
  15: ['Election timings', 'Validation round length and when elections open and close.'],
  16: ['Validator counts', 'Maximum, minimum and masterchain validator count.'],
  17: ['Stake limits', 'Minimum and maximum validator stake and the stake factor cap.'],
  18: ['Storage prices', 'Price of keeping data on chain, per bit and per cell per second.'],
  19: ['Global ID', 'Network identifier (-239 mainnet, -3 testnet).'],
  20: ['Gas prices (masterchain)', 'Gas price and limits on the masterchain.'],
  21: ['Gas prices (basechain)', 'Gas price and limits on the basechain, where wallets and apps live.'],
  22: ['Block limits (masterchain)', 'Size, gas and logical time limits of masterchain blocks.'],
  23: ['Block limits (basechain)', 'Size, gas and logical time limits of basechain blocks.'],
  24: ['Message prices (masterchain)', 'Forwarding fees for messages sent to or within the masterchain.'],
  25: ['Message prices (basechain)', 'Forwarding fees for messages on the basechain.'],
  28: ['Catchain config', 'Lifetimes of validator sessions and shard validator group size.'],
  29: ['Consensus config', 'Block consensus round timings and size limits.'],
  30: ['New consensus config', 'Settings of the new consensus protocol (not decoded here, see raw BOC).'],
  31: ['Fundamental contracts', 'System contracts that pay no fees on the masterchain.'],
  32: ['Previous validators', 'Validator set of the previous round.'],
  33: ['Previous temp validators', 'Temporary validator set of the previous round.'],
  34: ['Current validators', 'Validator set of the current round.'],
  35: ['Current temp validators', 'Temporary validator set of the current round.'],
  36: ['Next validators', 'Validator set elected for the next round (only during the switch).'],
  37: ['Next temp validators', 'Temporary validator set of the next round.'],
  39: ['Validator temp keys', 'Signed temporary keys of validators.'],
  40: ['Misbehaviour punishment', 'Fines for validators that misbehave.'],
  43: ['Size limits', 'Maximum message, account state and library sizes.'],
  44: ['Suspended addresses', 'Accounts that cannot be initialised until the given time.'],
  45: ['Precompiled contracts', 'Contracts whose get/transaction gas is fixed by the network.'],
  46: ['Validator registry', 'Validator registry settings (not decoded here, see raw BOC).'],
  71: ['Ethereum bridge', 'TON-Ethereum coin bridge oracles.'],
  72: ['BNB Chain bridge', 'TON-BNB Smart Chain coin bridge oracles.'],
  73: ['Polygon bridge', 'TON-Polygon coin bridge oracles.'],
  79: ['ETH token bridge', 'Ethereum to TON token bridge.'],
  81: ['BNB token bridge', 'BNB Smart Chain to TON token bridge.'],
  82: ['Polygon token bridge', 'Polygon to TON token bridge.']
}

/** GlobalCapabilities in ton/ton-types.h. */
export const CAPABILITIES: [number, string][] = [
  [1, 'IHR enabled'], [2, 'Create stats'], [4, 'Bounce message body'], [8, 'Report version'],
  [16, 'Split/merge transactions'], [32, 'Short dequeue'], [64, 'Store out msg queue size'],
  [128, 'Message metadata'], [256, 'Deferred messages'], [512, 'Full collated data']
]

export interface ParamField {
  label: string
  value: string
  hint?: string
  /** Raw address (wc:hex) to render as a link. */
  address?: string
}

export interface DecodedParam {
  id: number
  name: string
  about: string
  /** base64 BOC of the param cell. */
  boc: string
  /** Cell hash, hex. */
  hash: string
  fields: ParamField[]
  /** Full decoded value (bigint-safe, for JsonView), null when there is no decoder. */
  json: unknown
  error?: string
}

// ---------------------------------------------------------------- formatting helpers

/** 65536 → "18 h 12 min". */
export function duration(sec: number): string {
  if (sec < 60) return `${sec} s`
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') || `${sec} s`
}

const num = (v: bigint | number) => Number(v).toLocaleString('en-US')
/** Fixed-point value with 16 fractional bits (gas and forward prices) → decimal string. */
export function frac16(v: bigint | number): string {
  return (Number(v) / 65536).toLocaleString('en-US', { maximumFractionDigits: 4 })
}
const coin = (v: bigint) => formatCoin(v)
/** Storage price (nano per 2^16 s) → nano per 365-day year, rounded down. */
export const perYear = (v: bigint | number) => num((BigInt(v) * 31_536_000n) / 65536n)
const date = (unix: number) => (unix ? new Date(unix * 1000).toISOString().replace('.000Z', 'Z').replace('T', ' ') : 'genesis')
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

/** Makes @ton values JSON-friendly: Address → raw string, Buffer → hex, Dictionary/Map → object, Set → array. */
export function plain(v: unknown): unknown {
  if (v instanceof Address) return v.toRawString()
  if (v instanceof Uint8Array) return hex(v)
  if (v instanceof Cell) return v.toBoc().toString('base64')
  if (v instanceof Set) return [...v].map(plain)
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)]))
  if (v && typeof v === 'object' && 'keys' in v && 'get' in v && typeof (v as Dictionary<number, unknown>).keys === 'function' && !(Array.isArray(v))) {
    const d = v as Dictionary<number, unknown>
    return Object.fromEntries(d.keys().map(k => [String(k), plain(d.get(k))]))
  }
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}

const addr256 = (s: Slice) => `-1:${s.loadUintBig(256).toString(16).padStart(64, '0')}`

// ---------------------------------------------------------------- per-param decoders

/** SizeLimitsConfig (v1/v2/v3 per current block.tlb; libraries and tonapi still use an older v2 layout). */
export function parseSizeLimits(s: Slice) {
  const tag = s.loadUint(8)
  if (tag < 1 || tag > 3) throw new Error(`Unknown SizeLimitsConfig tag ${tag}`)
  const r: Record<string, number | null> = {
    max_msg_bits: s.loadUint(32), max_msg_cells: s.loadUint(32), max_library_cells: s.loadUint(32),
    max_vm_data_depth: s.loadUint(16), max_ext_msg_size: s.loadUint(32), max_ext_msg_depth: s.loadUint(16)
  }
  if (tag >= 2) {
    Object.assign(r, {
      max_acc_state_cells: s.loadUint(32), max_mc_acc_state_cells: s.loadUint(32), max_acc_public_libraries: s.loadUint(32),
      defer_out_queue_size_limit: s.loadUint(32), max_msg_extra_currencies: s.loadUint(32), max_acc_fixed_prefix_length: s.loadUint(8),
      acc_state_cells_for_storage_dict: s.loadUint(32), max_transaction_library_loads: s.loadBit() ? s.loadUint(32) : null
    })
  }
  if (tag === 3) {
    Object.assign(r, {
      max_total_msg_bits: s.loadUint(32), max_total_msg_cells: s.loadUint(32),
      out_msg_queue_size_hard_limit: s.loadUint(32), out_msg_queue_size_soft_limit: s.loadUint(32)
    })
  }
  return { version: tag, ...r } as { version: number } & Record<string, number | null>
}

const vsetFields = (v: NonNullable<ReturnType<typeof configParseValidatorSet>>): ParamField[] => [
  { label: 'Active', value: `${date(v.timeSince)} → ${date(v.timeUntil)}`, hint: `${duration(v.timeUntil - v.timeSince)} round` },
  { label: 'Validators', value: `${v.total} (${v.main} on the masterchain)` },
  ...(v.totalWeight !== null ? [{ label: 'Total weight', value: v.totalWeight.toString(), hint: 'Votes are weighted by this; ¾ is needed to accept a config proposal.' }] : [])
]

const gasFields = (g: ReturnType<typeof configParseGasLimitsPrices>): ParamField[] => [
  { label: 'Gas price', value: `${frac16(g.other.gasPrice)} nano per gas unit`, hint: `Raw ${g.other.gasPrice} (16.16 fixed point). 1M gas = ${coin(g.other.gasPrice * 1_000_000n / 65536n)}` },
  { label: 'Flat gas', value: `First ${num(g.flatLimit)} gas for ${coin(g.flatGasPrice)}` },
  { label: 'Gas limit per transaction', value: num(g.other.gasLimit), hint: g.other.specialGasLimit !== undefined ? `Special accounts: ${num(g.other.specialGasLimit)}` : undefined },
  { label: 'Gas credit (external messages)', value: num(g.other.gasCredit) },
  { label: 'Block gas limit', value: num(g.other.blockGasLimit) },
  { label: 'Freeze when storage debt above', value: coin(g.other.freezeDueLimit) },
  { label: 'Delete when storage debt above', value: coin(g.other.deleteDueLimit) }
]

const msgFields = (m: ReturnType<typeof configParseMsgPrices>): ParamField[] => [
  { label: 'Lump price', value: coin(m.lumpPrice), hint: 'Paid for every message, covers the first cell.' },
  { label: 'Per bit', value: `${frac16(m.bitPrice)} nano` },
  { label: 'Per cell', value: `${frac16(m.cellPrice)} nano` },
  { label: 'First / next fraction', value: `${frac16(m.firstFrac * 100)}% / ${frac16(m.nextFrac * 100)}%`, hint: 'Share of the forward fee kept by the current validator.' }
]

interface Limits { underload: number, softLimit: number, hardLimit: number }
function loadLimits(s: Slice): Limits {
  if (s.loadUint(8) !== 0xc3) throw new Error('Unexpected ParamLimits tag')
  return { underload: s.loadUint(32), softLimit: s.loadUint(32), hardLimit: s.loadUint(32) }
}
/** block_limits#5d / block_limits_v2#5e (block.tlb). */
export function parseBlockLimits(s: Slice) {
  const tag = s.loadUint(8)
  if (tag !== 0x5d && tag !== 0x5e) throw new Error('Unexpected BlockLimits tag')
  const r: { bytes: Limits, gas: Limits, ltDelta: Limits, collatedData?: Limits, importedMsgQueue?: { maxBytes: number, maxMsgs: number } } = { bytes: loadLimits(s), gas: loadLimits(s), ltDelta: loadLimits(s) }
  if (tag === 0x5e) {
    r.collatedData = loadLimits(s)
    if (s.loadUint(8) !== 0xd3) throw new Error('Unexpected ImportedMsgQueueLimits tag')
    r.importedMsgQueue = { maxBytes: s.loadUint(32), maxMsgs: s.loadUint(32) }
  }
  return r
}
const limitFields = (b: ReturnType<typeof parseBlockLimits>): ParamField[] => (
  [['Bytes', b.bytes], ['Gas', b.gas], ['Logical time delta', b.ltDelta], ...(b.collatedData ? [['Collated data', b.collatedData]] : [])] as [string, Limits][]
).map(([label, l]) => ({ label, value: `${num(l.underload)} / ${num(l.softLimit)} / ${num(l.hardLimit)}`, hint: 'underload / soft / hard limit' }))

const proposalSetupFields = (label: string, p: ReturnType<typeof parseVotingSetup>['normalParams']): ParamField => ({
  label,
  value: `${p.minWins} winning rounds of ${p.minTotalRounds}–${p.maxTotalRounds}, max ${p.maxLoses} lost`,
  hint: `Stored ${duration(p.minStoreSec)} to ${duration(p.maxStoreSec)}; ${p.bitPrice} nano/bit, ${p.cellPrice} nano/cell per second`
})

function decodeBody(id: number, s: Slice): { fields: ParamField[], json: unknown } | null {
  switch (id) {
    case 0: case 1: case 2: case 3: case 4: {
      const a = addr256(s)
      return { fields: [{ label: 'Address', value: a, address: a }], json: a }
    }
    case 5: {
      const b = configParse5(s)
      const share = (b.feeBurnNominator / b.feeBurnDenominator) * 100
      return {
        fields: [
          { label: 'Burned share of fees', value: `${b.feeBurnNominator}/${b.feeBurnDenominator} (${share.toLocaleString('en-US', { maximumFractionDigits: 2 })}%)` },
          ...(b.blackholeAddr ? [{ label: 'Black hole address', value: b.blackholeAddr.toRawString(), address: b.blackholeAddr.toRawString() }] : [])
        ],
        json: b
      }
    }
    case 6: {
      const p = { mintNewPrice: s.loadCoins(), mintAddPrice: s.loadCoins() }
      return { fields: [{ label: 'New currency', value: coin(p.mintNewPrice) }, { label: 'Mint more', value: coin(p.mintAddPrice) }], json: p }
    }
    case 7: {
      // ExtraCurrencyCollection = HashmapE 32 (VarUInteger 32); ids are shown signed (4294967279 = -17)
      const d = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.BigVarUint(5))
      const list = d.keys().map(k => ({ id: k >= 2 ** 31 ? k - 2 ** 32 : k, amount: d.get(k)! }))
      return { fields: list.map(c => ({ label: `Currency ${c.id}`, value: num(c.amount), hint: 'smallest units' })), json: list }
    }
    case 8: {
      // capabilities#c4 version:uint32 capabilities:uint64 (@ton/ton's configParse8 forgets the tag)
      if (s.loadUint(8) !== 0xc4) throw new Error('Unexpected GlobalVersion tag')
      const v = { version: s.loadUint(32), capabilities: s.loadUintBig(64) }
      const caps = CAPABILITIES.filter(([bit]) => (v.capabilities & BigInt(bit)) !== 0n).map(([, n]) => n)
      return {
        fields: [
          { label: 'Version', value: String(v.version) },
          { label: 'Capabilities', value: `${v.capabilities} (0x${v.capabilities.toString(16)})`, hint: caps.join(', ') || 'none' }
        ],
        json: { ...v, enabled: caps }
      }
    }
    case 9: case 10: {
      const ids = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.BitString(0), s).keys().sort((a, b) => a - b)
      return { fields: [{ label: 'Params', value: ids.join(', ') }], json: ids }
    }
    case 11: {
      const v = parseVotingSetup(s)
      return { fields: [proposalSetupFields('Normal params', v.normalParams), proposalSetupFields('Critical params', v.criticalParams)], json: v }
    }
    case 12: {
      const w = configParse12(s)
      return {
        fields: w.keys().map(k => {
          const d = w.get(k)!
          return { label: `Workchain ${k}`, value: `${d.active ? 'active' : 'inactive'}, ${d.accept_msgs ? 'accepts messages' : 'no messages'}, up to ${2 ** d.max_split} shards`, hint: `Enabled since ${date(d.enabledSince)}, split ${d.min_split}–${d.max_split}, version ${d.version}` }
        }),
        json: w
      }
    }
    case 13: {
      const c = configParse13(s)
      return { fields: [{ label: 'Deposit', value: coin(c.deposit) }, { label: 'Per bit / per cell', value: `${c.bitPrice} / ${c.cellPrice} nano` }], json: c }
    }
    case 14: {
      if (s.loadUint(8) !== 0x6b) throw new Error('Unexpected BlockCreateFees tag')
      const c = { masterchainBlockFee: s.loadCoins(), workchainBlockFee: s.loadCoins() }
      return { fields: [{ label: 'Masterchain block', value: coin(c.masterchainBlockFee) }, { label: 'Basechain block', value: coin(c.workchainBlockFee) }], json: c }
    }
    case 15: {
      const t = configParse15(s)
      return {
        fields: [
          { label: 'Round length', value: duration(t.validatorsElectedFor), hint: `${t.validatorsElectedFor} s` },
          { label: 'Elections open', value: `${duration(t.electorsStartBefore)} before the round`, hint: `${t.electorsStartBefore} s` },
          { label: 'Elections close', value: `${duration(t.electorsEndBefore)} before the round`, hint: `${t.electorsEndBefore} s` },
          { label: 'Stake frozen for', value: `${duration(t.stakeHeldFor)} after the round`, hint: `${t.stakeHeldFor} s` }
        ],
        json: t
      }
    }
    case 16: {
      const c = configParse16(s)
      return { fields: [{ label: 'Validators', value: `${c.minValidators} to ${c.maxValidators}` }, { label: 'On the masterchain', value: `up to ${c.maxMainValidators}` }], json: c }
    }
    case 17: {
      const c = configParse17(s)
      return {
        fields: [
          { label: 'Minimum stake', value: coin(c.minStake) },
          { label: 'Maximum stake', value: coin(c.maxStake) },
          { label: 'Minimum total stake', value: coin(c.minTotalStake) },
          { label: 'Max stake factor', value: `${frac16(c.maxStakeFactor)}×`, hint: 'A validator counts at most this many times the smallest elected stake.' }
        ],
        json: c
      }
    }
    case 18: {
      const list = configParse18(s)
      return {
        // Prices are nano per 2^16 seconds; per year reads better than 0.0021 nano per second.
        fields: list.map(p => ({
          label: `Since ${date(p.utime_since)}`,
          value: `${perYear(p.cell_price_ps)} nano/cell, ${perYear(p.bit_price_ps)} nano/bit per year`,
          hint: `Masterchain: ${perYear(p.mc_cell_price_ps)} nano/cell, ${perYear(p.mc_bit_price_ps)} nano/bit per year. Raw per 65536 s: cell ${p.cell_price_ps}, bit ${p.bit_price_ps}, mc cell ${p.mc_cell_price_ps}, mc bit ${p.mc_bit_price_ps}`
        })),
        json: list
      }
    }
    case 19: {
      const g = s.loadInt(32)
      return { fields: [{ label: 'Global ID', value: String(g), hint: g === -239 ? 'mainnet' : g === -3 ? 'testnet' : undefined }], json: g }
    }
    case 20: case 21: {
      const g = configParseGasLimitsPrices(s)
      return { fields: gasFields(g), json: g }
    }
    case 22: case 23: {
      const b = parseBlockLimits(s)
      return { fields: limitFields(b), json: b }
    }
    case 24: case 25: {
      const m = configParseMsgPrices(s)
      return { fields: msgFields(m), json: m }
    }
    case 28: {
      const c = configParse28(s)
      return { fields: [{ label: 'Shard validators', value: String(c.shardValidatorsCount) }, { label: 'Masterchain session', value: `${c.masterCatchainLifetime} s` }, { label: 'Shard validator group', value: `${c.shardValidatorsLifetime} s` }], json: c }
    }
    case 29: {
      const c = configParse29(s)
      return {
        fields: [
          { label: 'Consensus timeout', value: `${c.consensusTimeout} ms` },
          { label: 'Next candidate delay', value: `${c.nextCandidateDelay} ms` },
          { label: 'Max block size', value: `${num(c.maxBlockBytes)} bytes` }
        ],
        json: c
      }
    }
    case 31: {
      const ids = s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.BitString(0)).keys().map(k => `-1:${k.toString(16).padStart(64, '0')}`) // HashmapE
      return { fields: ids.map((a, i) => ({ label: `#${i + 1}`, value: a, address: a })), json: ids }
    }
    case 32: case 33: case 34: case 35: case 36: case 37: {
      const v = configParseValidatorSet(s)
      return v ? { fields: vsetFields(v), json: v } : null
    }
    case 40: {
      const p = configParse40(s)
      return p ? { fields: [{ label: 'Default flat fine', value: coin(p.defaultFlatFine) }, { label: 'Default proportional fine', value: `${p.defaultProportionaFine}` }], json: p } : null
    }
    case 43: {
      const l = parseSizeLimits(s)
      return {
        fields: [
          { label: 'Max message size', value: `${num(l.max_msg_cells!)} cells, ${num(l.max_msg_bits!)} bits` },
          { label: 'Max external message', value: `${num(l.max_ext_msg_size!)} bytes, depth ${l.max_ext_msg_depth}` },
          ...(l.max_acc_state_cells != null ? [{ label: 'Max account state', value: `${num(l.max_acc_state_cells)} cells (masterchain ${num(l.max_mc_acc_state_cells!)})` }] : []),
          { label: 'Max library cells', value: num(l.max_library_cells!) }
        ],
        json: l
      }
    }
    case 44: {
      // suspended_address_list#00 addresses:(HashmapE 288 Unit) suspended_until:uint32; key = workchain:int32 address:bits256
      if (s.loadUint(8) !== 0) throw new Error('Unexpected SuspendedAddressList tag')
      const keys = s.loadDict(Dictionary.Keys.BigUint(288), Dictionary.Values.BitString(0)).keys()
      const until = s.loadUint(32)
      const addresses = keys.map((k) => {
        const wc = Number(k >> 256n)
        return `${wc >= 2 ** 31 ? wc - 2 ** 32 : wc}:${(k & ((1n << 256n) - 1n)).toString(16).padStart(64, '0')}`
      })
      return { fields: [{ label: 'Suspended accounts', value: String(addresses.length) }, { label: 'Until', value: date(until) }], json: { addresses, suspendedUntil: until } }
    }
    case 45: {
      // precompiled_contracts_config#c0 list:(HashmapE 256 PrecompiledSmc); precompiled_smc#b0 gas_usage:uint64
      if (s.loadUint(8) !== 0xc0) throw new Error('Unexpected PrecompiledContractsConfig tag')
      const d = s.loadDict(Dictionary.Keys.BigUint(256), { serialize: () => { throw new Error('read only') }, parse: (v: Slice) => (v.loadUint(8) === 0xb0 ? v.loadUintBig(64) : -1n) })
      const list = d.keys().map(k => ({ codeHash: k.toString(16).padStart(64, '0'), gasUsage: d.get(k)! }))
      return { fields: list.map(c => ({ label: `Code ${c.codeHash.slice(0, 12)}…`, value: `${num(c.gasUsage)} gas`, hint: c.codeHash })), json: list }
    }
    case 71: case 72: case 73: {
      const b = configParseBridge(s)
      return b ? { fields: [{ label: 'Bridge', value: b.bridgeAddress.toRawString(), address: b.bridgeAddress.toRawString() }, { label: 'Oracles', value: String(b.oracles.size) }], json: b } : null
    }
    default:
      return null
  }
}

export function decodeParam(id: number, cell: Cell): DecodedParam {
  const [name, about] = PARAM_INFO[id] ?? [`Param ${id}`, id < 0 ? 'Custom param (negative id), not defined in block.tlb.' : 'Not defined in block.tlb.']
  const base = { id, name, about, boc: cell.toBoc().toString('base64'), hash: cell.hash().toString('hex') }
  try {
    const d = decodeBody(id, cell.beginParse())
    return { ...base, fields: d?.fields ?? [], json: d ? plain(d.json) : null }
  }
  catch (e) {
    return { ...base, fields: [], json: null, error: (e as Error).message }
  }
}

/** Standard params (0, 1, 2…) first, then the custom negative ids some networks add. */
const byParamId = (a: number, b: number) => Number(a < 0) - Number(b < 0) || a - b

/** Splits a full config (getConfigAll `config.bytes`, the ConfigParams dictionary root) into param cells. */
export function splitConfig(b64: string): Map<number, Cell> {
  const dict = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), Cell.fromBase64(b64))
  return new Map(dict.keys().sort(byParamId).map(k => [k, dict.get(k)!]))
}

export function decodeConfig(b64: string): DecodedParam[] {
  return [...splitConfig(b64)].map(([id, cell]) => decodeParam(id, cell))
}

export interface ParamChange { id: number, kind: 'added' | 'removed' | 'changed', before?: DecodedParam, after?: DecodedParam }

/** Params whose cell differs between two configs (by cell hash). */
export function diffConfigs(before: DecodedParam[], after: DecodedParam[]): ParamChange[] {
  const a = new Map(before.map(p => [p.id, p]))
  const b = new Map(after.map(p => [p.id, p]))
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort(byParamId)
  const out: ParamChange[] = []
  for (const id of ids) {
    const x = a.get(id)
    const y = b.get(id)
    if (!x) out.push({ id, kind: 'added', after: y })
    else if (!y) out.push({ id, kind: 'removed', before: x })
    else if (x.hash !== y.hash) out.push({ id, kind: 'changed', before: x, after: y })
  }
  return out
}

/** toncenter v2 getConfigParam / getConfigAll response → cell (base64 BOC); empty bytes means the param is absent. */
export function configCell(bytes: string): Cell | null {
  return bytes ? Cell.fromBase64(bytes) : null
}
