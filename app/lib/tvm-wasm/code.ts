// Shared by the tvm-wasm tools (disassembler, assembler, local get-method emulator).
// Pure TS on @ton/core: import from logic.ts / Tool.vue only (client side).
import { Address, beginCell, Cell, CellType, Dictionary, getMethodId } from '@ton/core'
import { parseBoc } from '~/utils/ton/messages'

export type Tasm = typeof import('@ton/tasm')
type Instr = ReturnType<Tasm['runtime']['decompileCell']>[number]

/** Entry points every TVM contract may define (fixed ids, not crc16 names). */
export const SPECIAL_METHODS: Record<number, string> = {
  0: 'recv_internal',
  [-1]: 'recv_external',
  [-2]: 'run_ticktock',
  [-3]: 'split_prepare',
  [-4]: 'split_install'
}

/** Well-known get-method names. Their ids are crc16(name) | 0x10000, computed with @ton/core getMethodId. */
export const KNOWN_GET_METHODS = [
  // wallets
  'seqno', 'get_public_key', 'get_subwallet_id', 'get_plugin_list', 'is_plugin_installed', 'get_extensions', 'is_signature_allowed',
  'get_last_clean_time', 'get_timeout', 'processed?', 'get_wallet_id',
  // jettons (TEP-74/89)
  'get_wallet_address', 'get_jetton_data', 'get_wallet_data', 'get_status', 'get_next_admin_address', 'get_wallet_status',
  // NFT / SBT / DNS (TEP-62/66/85/81)
  'get_nft_data', 'get_collection_data', 'get_nft_address_by_index', 'get_nft_content', 'royalty_params', 'get_authority_address',
  'get_revoked_time', 'get_editor', 'dnsresolve', 'get_domain', 'get_auction_info', 'get_last_fill_up_time', 'get_full_domain',
  'get_telemint_token_name', 'get_telemint_auction_state', 'get_telemint_auction_config',
  // Tact
  'supported_interfaces', 'get_abi_ipfs', 'lazy_deployment_completed',
  // DEX / staking / system
  'get_pool_data', 'get_lp_account_address', 'get_router_data', 'get_expected_outputs', 'get_lp_data', 'get_pool_full_data',
  'get_nominator_data', 'get_staking_status', 'get_params', 'get_vesting_data', 'get_lockup_data', 'get_multisig_data',
  'get_order_address', 'get_order_data', 'participant_list', 'active_election_id', 'compute_returned_stake', 'past_elections',
  'get_balance', 'get_owner', 'owner', 'get_version', 'get_code_hash'
]

let known: Map<number, string> | null = null

/** id → name for special entry points and well-known get-methods, plus any `extra` pairs (e.g. from tonapi /inspect). */
export function methodNames(extra: { id: number, method: string }[] = []): Map<number, string> {
  known ??= new Map([
    ...Object.entries(SPECIAL_METHODS).map(([id, n]) => [Number(id), n] as const),
    ...KNOWN_GET_METHODS.map(n => [getMethodId(n), n] as const)
  ])
  const m = new Map(known)
  for (const e of extra) m.set(e.id, e.method)
  return m
}

export interface CodeMethod {
  id: number
  name: string | null
  /**
   * entry: recv_internal / recv_external / … (ids ≤ 0).
   * get: get-method (crc16(name) | 0x10000, so ≥ 65536, or any id with a known name).
   * proc: unnamed small id, a compiler-numbered internal function reached with CALLDICT (FunC/Tolk non-inlined helpers).
   */
  kind: 'entry' | 'get' | 'proc'
  instructions: Instr[]
}

/** Methods of the standard `SETCP 0; DICTPUSHCONST 19 [...]; DICTIGETJMPZ` layout (FunC, Tolk, Tact). Empty for hand-written code. */
export function codeMethods(instrs: Instr[], names = methodNames()): CodeMethod[] {
  const dict = instrs.find(i => i.$ === 'DICTPUSHCONST') as { arg1?: { $: string, methods?: { id: number, instructions: Instr[] }[] } } | undefined
  if (dict?.arg1?.$ !== 'DecompiledDict') return []
  const order = { entry: 0, get: 1, proc: 2 }
  return dict.arg1.methods!
    .map((m) => {
      const name = names.get(m.id) ?? null
      const kind: CodeMethod['kind'] = m.id <= 0 ? 'entry' : name || m.id >= 0x10000 ? 'get' : 'proc'
      return { id: m.id, name, kind, instructions: m.instructions }
    })
    .sort((a, b) => order[a.kind] - order[b.kind] || (a.name ?? '~').localeCompare(b.name ?? '~') || a.id - b.id)
}

/** Library hash (hex) referenced by an exotic library cell, else null. */
export function libraryHashOf(cell: Cell): string | null {
  if (cell.type !== CellType.Library) return null
  return cell.beginParse(true).skip(8).loadBuffer(32).toString('hex')
}

/** Every distinct library hash (hex) referenced anywhere in the tree. */
export function libraryHashes(root: Cell): string[] {
  const out = new Set<string>()
  const seen = new Set<string>()
  const walk = (c: Cell) => {
    const h = c.hash().toString('hex')
    if (seen.has(h)) return
    seen.add(h)
    const lib = libraryHashOf(c)
    if (lib) out.add(lib)
    c.refs.forEach(walk)
  }
  walk(root)
  return [...out]
}

/** Library dictionary (HashmapE 256 ^Cell, keyed by the code's own hash) as the emulator expects it in `libs`. */
export function libsDict(libs: Cell[]): Cell | undefined {
  if (!libs.length) return undefined
  const d = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  for (const c of libs) d.set(BigInt('0x' + c.hash().toString('hex')), c)
  return beginCell().storeDictDirect(d).endCell()
}

export type CodeSource = { kind: 'address', address: Address } | { kind: 'boc', cell: Cell }

/** A TON address (fetch its code) or a code BOC (base64/hex). */
export function parseCodeSource(input: string): CodeSource {
  const s = input.trim()
  if (!s) throw new Error('Paste a contract address or a code BOC')
  if (Address.isFriendly(s) || Address.isRaw(s)) return { kind: 'address', address: Address.parse(s) }
  try {
    return { kind: 'boc', cell: parseBoc(s) }
  }
  catch {
    throw new Error('Not a TON address or a BOC. Paste EQ…/UQ…/0:… or a code BOC (te6cc… / b5ee9c72…).')
  }
}

/** Minimal shape of useToncenter() so the fetch helpers stay testable. */
export interface ToncenterClient {
  v2<T>(method: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>
  v3<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>
}

/** Fetches library cells by hash (toncenter getLibraries) and checks each one really hashes to what was asked. */
export async function fetchLibraries(tc: ToncenterClient, hashesHex: string[]): Promise<Cell[]> {
  const out: Cell[] = []
  for (const hex of hashesHex) {
    const want = Buffer.from(hex, 'hex').toString('base64')
    const res = await tc.v2<{ result: { hash: string, data: string }[] }>('getLibraries', { libraries: want })
    const entry = res.result.find(e => e.hash === want)
    if (!entry) throw new Error(`Library ${hex} is not published on this network.`)
    const cell = Cell.fromBase64(entry.data)
    if (cell.hash().toString('hex') !== hex) throw new Error(`toncenter returned a library that does not hash to ${hex}. Not trusting it.`)
    out.push(cell)
  }
  return out
}

export interface AccountState {
  address: Address
  status: string
  balance: bigint
  code: Cell
  data: Cell
  /** Library cells the code references, fetched and verified. */
  libs: Cell[]
  lastLt: string | null
}

/** Code, data, balance and libraries of a deployed account (toncenter v3 /account + v2 getLibraries). */
export async function fetchAccountState(tc: ToncenterClient, address: Address): Promise<AccountState> {
  const raw = address.toRawString()
  const a = await tc.v3<{ status: string, balance: string, code: string | null, data: string | null, last_transaction_lt?: string }>('account', { address: raw })
  if (!a.code) {
    throw new Error(a.status === 'frozen'
      ? 'This account is frozen: it has no code until it is unfrozen.'
      : `This account has no code (status: ${a.status || 'nonexist'}). It is not deployed yet.`)
  }
  const code = Cell.fromBase64(a.code)
  const data = a.data ? Cell.fromBase64(a.data) : beginCell().endCell()
  const libs = await fetchLibraries(tc, libraryHashes(code))
  return { address, status: a.status, balance: BigInt(a.balance ?? 0), code, data, libs, lastLt: a.last_transaction_lt ?? null }
}

/** When the whole code is one library cell, the real code (from `libs`); otherwise the code itself. */
export function effectiveCode(code: Cell, libs: Cell[]): Cell {
  const h = libraryHashOf(code)
  return (h && libs.find(l => l.hash().toString('hex') === h)) || code
}
