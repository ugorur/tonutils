// Mintless jettons (TEP-176 custom payload API + TEP-177 Merkle airdrop), as implemented by
// ton-community/mintless-jetton and used on mainnet by HMSTR. Shared by mintless-jetton-airdrop-builder and mintless-claim.
//
// _ amount:Coins start_from:uint48 expire_at:uint48 = AirdropItem;     airdrop: HashmapE 267 (owner MsgAddressInt) AirdropItem
// merkle_airdrop_claim#0df602d6 proof:^Cell = CustomPayload;           proof: MerkleProof of the airdrop dict root
// Jetton wallet data: status:uint4 balance:Coins owner:MsgAddressInt master:MsgAddressInt merkle_root:uint256 salt:uint10
import type { DictionaryValue, Slice } from '@ton/core'
import { Address, beginCell, Cell, convertToMerkleProof, contractAddress, Dictionary, loadStateInit } from '@ton/core'

export const OP_MERKLE_AIRDROP_CLAIM = 0x0df602d6
/** Reference mintless jetton wallet code (ton-community/mintless-jetton); HMSTR stores it as a library cell. */
export const MINTLESS_WALLET_CODE_HASH = '0f1ad3d8a46bd283321dde639195fb72602e9b31b1727fecc25e2edc10966df4'
const KEY_BITS = 267
const SALT_ITERATIONS = 32

export interface AirdropItem {
  amount: bigint
  startFrom: number
  expireAt: number
}

export const airdropValue: DictionaryValue<AirdropItem> = {
  serialize: (src, b) => {
    b.storeCoins(src.amount).storeUint(src.startFrom, 48).storeUint(src.expireAt, 48)
  },
  parse: s => ({ amount: s.loadCoins(), startFrom: s.loadUint(48), expireAt: s.loadUint(48) })
}

// ---------------------------------------------------------------- CSV

export interface AirdropRow extends AirdropItem {
  address: Address
  line: number
}

export interface CsvDefaults {
  /** Jetton decimals used to read the amount column. */
  decimals: number
  /** Unix seconds used when a row leaves start_from / expire_at empty. */
  startFrom: number
  expireAt: number
}

/** Unix seconds, or an ISO date/time (UTC unless it has an offset). */
export function parseTime(v: string): number {
  const s = v.trim()
  if (/^\d+$/.test(s)) return Number(s)
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || !s.includes('T') ? s : s + 'Z')
  if (Number.isNaN(ms)) throw new Error(`"${v}" is not a unix time or ISO date`)
  return Math.floor(ms / 1000)
}

function parseAmount(v: string, decimals: number): bigint {
  const s = v.trim().replace(/_/g, '')
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) throw new Error(`amount "${v}" is not a positive number`)
  const frac = m[2] ?? ''
  if (frac.length > decimals) throw new Error(`amount "${v}" has more than ${decimals} decimals`)
  return BigInt(m[1]! + frac.padEnd(decimals, '0'))
}

/**
 * `address,amount[,start_from,expire_at]` per line; a header line, blank lines and `#` comments are skipped.
 * Separators: comma, semicolon or tab. Amounts are in whole tokens (12.5), times in unix seconds or ISO dates.
 */
export function parseAirdropCsv(text: string, d: CsvDefaults): { rows: AirdropRow[], errors: { line: number, message: string }[] } {
  const rows: AirdropRow[] = []
  const errors: { line: number, message: string }[] = []
  const seen = new Map<string, number>()
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    const t = raw.trim()
    if (!t || t.startsWith('#')) return
    const cols = t.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
    if (i === 0 && cols.length > 1 && !/\d/.test(cols[1]!)) return // header row: amount column is not a number
    try {
      if (cols.length < 2) throw new Error('needs at least address and amount')
      let address: Address
      try {
        address = Address.parse(cols[0]!)
      }
      catch {
        throw new Error(`"${cols[0]}" is not a TON address`)
      }
      if (address.workChain !== 0) throw new Error('only basechain (workchain 0) owners can claim mintless jettons')
      const amount = parseAmount(cols[1]!, d.decimals)
      if (amount <= 0n) throw new Error('amount must be greater than 0')
      const startFrom = cols[2] ? parseTime(cols[2]) : d.startFrom
      const expireAt = cols[3] ? parseTime(cols[3]) : d.expireAt
      for (const [n, v] of [['start_from', startFrom], ['expire_at', expireAt]] as const) {
        if (!Number.isSafeInteger(v) || v < 0 || v >= 2 ** 48) throw new Error(`${n} is out of range`)
      }
      if (expireAt <= startFrom) throw new Error('expire_at must be after start_from')
      const key = address.toRawString()
      const prev = seen.get(key)
      if (prev) throw new Error(`duplicate of line ${prev} (each owner can appear once)`)
      seen.set(key, line)
      rows.push({ address, amount, startFrom, expireAt, line })
    }
    catch (e) {
      errors.push({ line, message: (e as Error).message })
    }
  })
  return { rows, errors }
}

// ---------------------------------------------------------------- dictionary + proofs

export interface BuiltAirdrop {
  dict: Dictionary<Address, AirdropItem>
  /** storeDictDirect(dict): the cell whose hash is merkle_root. Publish its BOC as the merkle dump. */
  cell: Cell
  /** merkle_root for the minter, 64 hex chars. */
  root: string
  total: bigint
}

export function buildAirdrop(rows: Pick<AirdropRow, 'address' | 'amount' | 'startFrom' | 'expireAt'>[]): BuiltAirdrop {
  if (!rows.length) throw new Error('The airdrop list is empty')
  const dict = Dictionary.empty(Dictionary.Keys.Address(), airdropValue)
  let total = 0n
  for (const r of rows) {
    dict.set(r.address, { amount: r.amount, startFrom: r.startFrom, expireAt: r.expireAt })
    total += r.amount
  }
  const cell = beginCell().storeDictDirect(dict).endCell()
  return { dict, cell, root: cell.hash().toString('hex'), total }
}

function keyBits(owner: Address): boolean[] {
  const bits = beginCell().storeAddress(owner).endCell().bits
  return Array.from({ length: bits.length }, (_, i) => bits.at(i))
}

/** Reads a HashmapE label; returns its bits. `n` = key bits left at this node. */
function readLabel(s: Slice, n: number): boolean[] {
  const lenBits = Math.ceil(Math.log2(n + 1))
  if (!s.loadBit()) {
    let len = 0
    while (s.loadBit()) len++
    return Array.from({ length: len }, () => s.loadBit())
  }
  if (!s.loadBit()) {
    const len = s.loadUint(lenBits)
    return Array.from({ length: len }, () => s.loadBit())
  }
  const bit = s.loadBit()
  return Array.from({ length: s.loadUint(lenBits) }, () => bit)
}

function pruned(c: Cell): Cell {
  return beginCell().storeUint(1, 8).storeUint(1, 8).storeBuffer(c.hash(0)).storeUint(c.depth(0), 16).endCell({ exotic: true })
}

/**
 * Merkle proof for one owner, walking only that owner's path (O(depth), unlike Dictionary.generateMerkleProof which
 * re-serializes the whole dictionary per call). Byte-identical to @ton/core's output. Throws if the owner is absent.
 */
export function proofFor(dictCell: Cell, owner: Address): Cell {
  const key = keyBits(owner)
  const walk = (node: Cell, pos: number): Cell => {
    const s = node.beginParse()
    const label = readLabel(s, KEY_BITS - pos)
    if (label.some((b, i) => b !== key[pos + i])) throw new Error(`${owner.toString()} is not in the airdrop`)
    const next = pos + label.length
    if (next === KEY_BITS) return node
    const right = key[next]!
    const [l, r] = [node.refs[0]!, node.refs[1]!]
    return beginCell().storeBits(node.bits)
      .storeRef(right ? pruned(l) : walk(l, next + 1))
      .storeRef(right ? walk(r, next + 1) : pruned(r))
      .endCell()
  }
  return convertToMerkleProof(walk(dictCell, 0))
}

/** merkle_airdrop_claim#0df602d6 proof:^Cell: the custom_payload of the claiming jetton_transfer. */
export function claimPayload(proof: Cell): Cell {
  return beginCell().storeUint(OP_MERKLE_AIRDROP_CLAIM, 32).storeRef(proof).endCell()
}

export interface ParsedClaim {
  /** Merkle root the proof commits to (hex). Must equal the jetton wallet's merkle_root. */
  root: string
  /** The owner's airdrop entry, or null when the proof does not contain it. */
  item: AirdropItem | null
}

/** Reads a custom_payload (or a bare Merkle proof) and finds `owner`'s entry the way the jetton wallet does. */
export function parseClaim(payloadOrProof: Cell, owner: Address): ParsedClaim {
  let proof = payloadOrProof
  if (!proof.isExotic) {
    const s = proof.beginParse()
    if (s.remainingBits < 32 || s.loadUint(32) !== OP_MERKLE_AIRDROP_CLAIM) throw new Error('Not a merkle_airdrop_claim payload (op 0x0df602d6)')
    proof = s.loadRef()
  }
  const ps = proof.beginParse(true)
  if (!proof.isExotic || ps.loadUint(8) !== 3) throw new Error('The claim does not carry a Merkle proof cell')
  const root = ps.loadBuffer(32).toString('hex')
  const key = keyBits(owner)
  let node: Cell = proof.refs[0]!
  let pos = 0
  for (;;) {
    if (node.isExotic) return { root, item: null }
    const s = node.beginParse()
    const label = readLabel(s, KEY_BITS - pos)
    if (label.some((b, i) => b !== key[pos + i])) return { root, item: null }
    pos += label.length
    if (pos === KEY_BITS) return { root, item: airdropValue.parse(s) }
    node = node.refs[key[pos] ? 1 : 0]!
    pos++
  }
}

// ---------------------------------------------------------------- jetton wallet state_init

/** Library cell pointing at a code hash (how HMSTR deploys the shared wallet code). */
export function libraryCell(codeHashHex: string): Cell {
  const b = beginCell().storeUint(2, 8).storeBuffer(Buffer.from(codeHashHex, 'hex')).endCell()
  return new Cell({ exotic: true, bits: b.bits, refs: [] })
}

function walletStateInitCell(code: Cell, data: Cell): Cell {
  return beginCell().storeUint(0, 2).storeMaybeRef(code).storeMaybeRef(data).storeUint(0, 1).endCell()
}

/**
 * The owner's jetton wallet state_init, as the minter's get_wallet_state_init_and_salt computes it: salt 0..32,
 * keep the first salt whose address shares the most of the owner's top 4 bits (same shard).
 */
export function mintlessWalletInit(p: { owner: Address, master: Address, merkleRoot: string, code?: Cell }): { stateInit: Cell, address: Address, salt: number } {
  const code = p.code ?? libraryCell(MINTLESS_WALLET_CODE_HASH)
  const ownerPrefix = p.owner.hash[0]! >> 4
  let best: { stateInit: Cell, salt: number, distance: number } | null = null
  for (let salt = 0; salt <= SALT_ITERATIONS; salt++) {
    const data = beginCell().storeUint(0, 4).storeCoins(0).storeAddress(p.owner).storeAddress(p.master)
      .storeUint(BigInt('0x' + p.merkleRoot), 256).storeUint(salt, 10).endCell()
    const stateInit = walletStateInitCell(code, data)
    const distance = (stateInit.hash()[0]! >> 4) ^ ownerPrefix
    if (!best || distance < best.distance) best = { stateInit, salt, distance }
    if (distance === 0) break
  }
  return { stateInit: best!.stateInit, salt: best!.salt, address: new Address(0, best!.stateInit.hash()) }
}

export interface MintlessWalletData {
  address: Address
  owner: Address
  master: Address
  merkleRoot: string
  salt: number
  codeHash: string
  /** True when the code is a library reference (the usual mainnet deployment). */
  codeIsLibrary: boolean
}

/** Parses a mintless jetton wallet state_init (from the custom payload API) and derives its address. */
export function parseWalletInit(stateInit: Cell): MintlessWalletData {
  const si = loadStateInit(stateInit.beginParse())
  if (!si.code || !si.data) throw new Error('state_init has no code or data')
  const s = si.data.beginParse()
  s.loadUint(4)
  s.loadCoins()
  const owner = s.loadAddress()
  const master = s.loadAddress()
  const merkleRoot = s.loadUintBig(256).toString(16).padStart(64, '0')
  const salt = s.remainingBits >= 10 ? s.loadUint(10) : 0
  const lib = si.code.isExotic && si.code.bits.length === 264 && si.code.beginParse(true).preloadUint(8) === 2
  const codeHash = lib ? si.code.beginParse(true).skip(8).loadBuffer(32).toString('hex') : si.code.hash().toString('hex')
  return { address: contractAddress(0, si), owner, master, merkleRoot, salt, codeHash, codeIsLibrary: lib }
}

// ---------------------------------------------------------------- TEP-176 API response

export interface ClaimApiResponse {
  owner: string
  jetton_wallet: string
  custom_payload: string
  state_init: string
  compressed_info: { amount: string, start_from: string, expired_at: string }
}

/** What GET {custom_payload_api_uri}/wallet/{owner} must return (shape from ton-community/mintless-jetton scripts/claimApi.ts). */
export function claimApiResponse(built: BuiltAirdrop, owner: Address, master: Address, code?: Cell): ClaimApiResponse {
  const item = built.dict.get(owner)
  if (!item) throw new Error(`${owner.toString()} is not in the airdrop`)
  const w = mintlessWalletInit({ owner, master, merkleRoot: built.root, code })
  return {
    owner: owner.toRawString(),
    jetton_wallet: w.address.toRawString(),
    custom_payload: claimPayload(proofFor(built.cell, owner)).toBoc().toString('base64'),
    state_init: w.stateInit.toBoc().toString('base64'),
    compressed_info: { amount: item.amount.toString(), start_from: String(item.startFrom), expired_at: String(item.expireAt) }
  }
}
