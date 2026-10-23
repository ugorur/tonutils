import { Cell, CellType, Dictionary, getMethodId } from '@ton/core'

/** FunC/Tolk reserve these names; the compiler gives them fixed ids instead of the crc16 hash. */
export const RESERVED_METHODS: Record<string, { id: number, note: string }> = {
  main: { id: 0, note: 'Entry point for internal messages (same id as recv_internal)' },
  recv_internal: { id: 0, note: 'Entry point for internal messages' },
  recv_external: { id: -1, note: 'Entry point for external messages' },
  run_ticktock: { id: -2, note: 'Tick-tock transactions (special accounts only)' },
  split_prepare: { id: -3, note: 'Reserved for shard split (unused)' },
  split_install: { id: -4, note: 'Reserved for shard split (unused)' }
}

/** Common get-method names found on mainnet contracts. Used for reverse lookup (id → name). */
export const KNOWN_GETTERS: { name: string, where: string }[] = [
  // wallets
  { name: 'seqno', where: 'Wallets, config contract' },
  { name: 'get_public_key', where: 'Wallets v3+, highload' },
  { name: 'get_subwallet_id', where: 'Wallet v4, W5, highload v3' },
  { name: 'get_plugin_list', where: 'Wallet v4' },
  { name: 'is_plugin_installed', where: 'Wallet v4' },
  { name: 'get_extensions', where: 'Wallet W5' },
  { name: 'is_signature_allowed', where: 'Wallet W5' },
  { name: 'get_last_clean_time', where: 'Highload wallet v3' },
  { name: 'get_timeout', where: 'Highload wallet v3' },
  { name: 'processed?', where: 'Highload wallets' },
  // jettons (TEP-74, TEP-89)
  { name: 'get_jetton_data', where: 'Jetton master (TEP-74)' },
  { name: 'get_wallet_address', where: 'Jetton master (TEP-74)' },
  { name: 'get_wallet_data', where: 'Jetton wallet (TEP-74)' },
  { name: 'get_status', where: 'Governed jetton wallet (USD₮)' },
  { name: 'get_next_admin_address', where: 'Governed jetton master' },
  // NFTs (TEP-62, TEP-66, TEP-85)
  { name: 'get_nft_data', where: 'NFT item (TEP-62)' },
  { name: 'get_collection_data', where: 'NFT collection (TEP-62)' },
  { name: 'get_nft_address_by_index', where: 'NFT collection (TEP-62)' },
  { name: 'get_nft_content', where: 'NFT collection (TEP-62)' },
  { name: 'royalty_params', where: 'NFT collection / item (TEP-66)' },
  { name: 'get_authority_address', where: 'SBT (TEP-85)' },
  { name: 'get_revoked_time', where: 'SBT (TEP-85)' },
  { name: 'get_editor', where: 'Editable NFT' },
  // DNS & Telegram
  { name: 'dnsresolve', where: 'DNS resolver (TEP-81)' },
  { name: 'get_full_domain', where: 'DNS item, Telegram username' },
  { name: 'get_domain', where: '.ton DNS item' },
  { name: 'get_auction_info', where: '.ton DNS item' },
  { name: 'get_last_fill_up_time', where: '.ton DNS item' },
  { name: 'get_telemint_token_name', where: 'Telegram usernames / numbers' },
  { name: 'get_telemint_auction_state', where: 'Telegram usernames / numbers' },
  { name: 'get_telemint_auction_config', where: 'Telegram usernames / numbers' },
  // marketplaces
  { name: 'get_sale_data', where: 'Getgems sale contracts' },
  { name: 'get_offer_data', where: 'Getgems offer contracts' },
  // system & staking
  { name: 'active_election_id', where: 'Elector' },
  { name: 'participates_in', where: 'Elector' },
  { name: 'participant_list', where: 'Elector' },
  { name: 'participant_list_extended', where: 'Elector' },
  { name: 'compute_returned_stake', where: 'Elector' },
  { name: 'list_nominators', where: 'Nominator pool' },
  { name: 'get_nominator_data', where: 'Nominator pool' },
  { name: 'get_pool_data', where: 'Nominator pool, STON.fi pool' },
  { name: 'get_pool_full_data', where: 'Tonstakers pool' },
  // multisig & vesting
  { name: 'get_multisig_data', where: 'Multisig v2' },
  { name: 'get_order_address', where: 'Multisig v2' },
  { name: 'get_order_data', where: 'Multisig v2 order' },
  { name: 'get_vesting_data', where: 'Vesting wallet' },
  { name: 'get_whitelist', where: 'Vesting wallet' },
  { name: 'is_whitelisted', where: 'Vesting wallet' },
  // DEX
  { name: 'get_router_data', where: 'STON.fi router' },
  { name: 'get_pool_address', where: 'STON.fi router' },
  { name: 'get_expected_outputs', where: 'STON.fi pool' },
  { name: 'get_lp_account_address', where: 'STON.fi pool' },
  { name: 'get_lp_account_data', where: 'STON.fi LP account' },
  // payments
  { name: 'get_channel_data', where: 'Payment channel' }
]

export interface MethodIdResult {
  name: string
  /** Signed method id as used in the contract's method dictionary. */
  id: number
  /** 0x… form of the id (two's complement not used: negative ids are shown as -0x…). */
  hex: string
  /** Set when the name is a reserved entry point with a fixed id. */
  reserved?: string
}

/** method_id = (crc16(name) & 0xffff) | 0x10000, crc16 = CRC-16/XMODEM over the UTF-8 name. */
export function methodId(rawName: string): MethodIdResult {
  const name = rawName.trim()
  if (!name) throw new Error('Enter a method name')
  if (/\s/.test(name)) throw new Error('A method name cannot contain spaces')
  const reserved = RESERVED_METHODS[name]
  const id = reserved ? reserved.id : getMethodId(name)
  return { name, id, hex: toHex(id), reserved: reserved?.note }
}

function toHex(n: number) {
  return (n < 0 ? '-0x' : '0x') + Math.abs(n).toString(16)
}

/** One name per line (commas also split). Blank lines and duplicates are skipped. */
export function methodIds(text: string): (MethodIdResult | { name: string, error: string })[] {
  const names = [...new Set(text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean))]
  return names.map((n) => {
    try {
      return methodId(n)
    }
    catch (e) {
      return { name: n, error: (e as Error).message }
    }
  })
}

/** Accepts 85143, 0x14c97 or -1. */
export function parseMethodIdInput(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (/^-?\d+$/.test(s)) return Number(s)
  if (/^-?0x[0-9a-f]+$/.test(s)) return s.startsWith('-') ? -Number.parseInt(s.slice(3), 16) : Number.parseInt(s.slice(2), 16)
  return null
}

let byId: Map<number, string[]> | null = null

/** Known names whose id equals `id` (reserved entry points included). */
export function lookupId(id: number): { name: string, where: string }[] {
  if (!byId) {
    byId = new Map()
    for (const g of KNOWN_GETTERS) {
      const k = getMethodId(g.name)
      byId.set(k, [...(byId.get(k) ?? []), g.name])
    }
  }
  const reserved = Object.entries(RESERVED_METHODS).filter(([, r]) => r.id === id).map(([name, r]) => ({ name, where: r.note }))
  const known = (byId.get(id) ?? []).map(name => KNOWN_GETTERS.find(g => g.name === name)!)
  return [...reserved, ...known]
}

/**
 * Method dictionary keys are signed 19-bit ints (-262144…262143). Tools that read them as unsigned
 * (toncenter's contract_methods) show recv_external (-1) as 524287 (0x7ffff): map that range back.
 */
export function signed19(id: number) {
  return id >= 0x40000 && id < 0x80000 ? id - 0x80000 : id
}

/** A user-defined get-method id always has bit 16 set (0x10000–0x1ffff). */
export function isHashedId(id: number) {
  return id >= 0x10000 && id <= 0x1ffff
}

/**
 * Method ids from a contract's code when it uses the standard FunC/Tolk/Tact dispatcher
 * (SETCP0; DICTPUSHCONST n; DICTIGETJMPZ). Returns null for hand-written dispatchers (wallets v1–v3).
 */
export function methodIdsFromCode(code: Cell): number[] | null {
  const s = code.beginParse()
  if (s.remainingBits < 40 || !code.refs.length) return null
  if (s.loadUint(16) !== 0xff00 || s.loadUint(14) !== 0x3d29) return null // SETCP0, DICTPUSHCONST prefix F4A4_
  const keyBits = s.loadUint(10)
  const dict = Dictionary.loadDirect(Dictionary.Keys.Int(keyBits), { serialize: () => {}, parse: () => true }, code.refs[0]!)
  return [...dict.keys()].sort((a, b) => a - b)
}

export interface MethodRow {
  id: number
  hex: string
  kind: 'getter' | 'entry' | 'procedure'
  names: string
}

export interface ContractMethods {
  status: string
  interfaces: string[]
  source: 'toncenter' | 'code' | 'library'
  rows: MethodRow[] | null
}

interface ToncenterLike {
  v2<T>(method: string, query?: Record<string, string>): Promise<T>
  v3<T>(path: string, query?: Record<string, string | boolean>): Promise<T>
}

interface AccountState { status: string, code_boc?: string | null, contract_methods?: number[] | null, interfaces?: string[] | null }

export function describeIds(ids: number[]): MethodRow[] {
  return ids.map((id) => {
    const names = lookupId(id).map(m => m.name).join(', ')
    const kind = id <= 0 ? 'entry' : isHashedId(id) ? 'getter' : 'procedure'
    return { id, hex: toHex(id), kind, names }
  })
}

/** Lists a deployed contract's method ids: toncenter's own list when it has one, else the code's method dictionary. */
export async function contractMethods(address: string, tc: ToncenterLike): Promise<ContractMethods> {
  const { accounts } = await tc.v3<{ accounts?: AccountState[] }>('accountStates', { address, include_boc: true })
  const acc = accounts?.[0]
  if (!acc || acc.status !== 'active' || !acc.code_boc)
    throw new Error(`This account is ${acc?.status ?? 'not deployed'}, so it has no code to read.`)
  const interfaces = acc.interfaces ?? []
  if (acc.contract_methods?.length) {
    const ids = acc.contract_methods.map(signed19)
    return { status: acc.status, interfaces, source: 'toncenter', rows: describeIds(ids.sort((a, b) => a - b)) }
  }

  let code = Cell.fromBase64(acc.code_boc)
  let source: ContractMethods['source'] = 'code'
  if (code.isExotic && code.type === CellType.Library) {
    const hash = code.bits.substring(8, 256).toString()
    const lib = await tc.v2<{ result: { data: string }[] }>('getLibraries', { libraries: hash })
    if (!lib.result?.[0]?.data) throw new Error(`The code is a library cell (${hash.toLowerCase()}) that toncenter could not return.`)
    code = Cell.fromBase64(lib.result[0].data)
    source = 'library'
  }
  const ids = methodIdsFromCode(code)
  return { status: acc.status, interfaces, source, rows: ids && describeIds(ids) }
}
