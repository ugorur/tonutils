// Jetton minter code, TEP-64 content cells and admin message bodies, shared by jetton-deployer and
// jetton-admin-panel. Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { sha256_sync } from '@ton/crypto'
import { Address, beginCell, Cell, contractAddress, Dictionary, storeStateInit, type StateInit } from '@ton/core'
import { OP } from '~/utils/ton/opcodes'

// ---------------------------------------------------------------- contract flavors

/**
 * Jetton v2.1 minter (Tolk, "The Tolk Team"), ton-blockchain/acton-contracts@92225ba jetton-v2.1.
 * Byte-identical to what minter.ton.org deploys (ton-blockchain/minter src/lib/contracts/jetton-v2-minter.compiled.json).
 * The jetton wallet code is embedded in the minter code; storage is total_supply, admin, next_admin, ^content.
 */
export const JETTON_V21_MINTER_CODE_B64 = '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'

export type MinterFamily = 'v2' | 'legacy'

export interface MinterFlavor {
  id: 'v21' | 'v20' | 'stablecoin' | 'legacy'
  label: string
  family: MinterFamily
  /** How change-metadata works: a full TEP-64 content cell, or only an off-chain JSON URL. */
  metadata: 'content' | 'uri'
  /** Base64 code hash (toncenter `code_hash`). */
  codeHash: string
  source: string
}

/** Minter codes we verified (hash computed from the official build artifacts or read from mainnet). */
export const MINTER_FLAVORS: readonly MinterFlavor[] = [
  { id: 'v21', label: 'Jetton 2.1 (current minter.ton.org)', family: 'v2', metadata: 'content', codeHash: 'a/j0jKl9P9nI5VM0Tv568DDDIkWeLuIZegUhYvGWG/s=', source: 'ton-blockchain/acton-contracts jetton-v2.1' },
  { id: 'v20', label: 'Jetton 2.0 (FunC)', family: 'v2', metadata: 'uri', codeHash: 'brAc03DyVEW3ybWYko5EQAnDFzczSDWpVrkL3ZIiiJU=', source: 'ton-blockchain/jetton-contract branch jetton-2.0' },
  { id: 'stablecoin', label: 'Stablecoin contract (USD₮ type)', family: 'v2', metadata: 'uri', codeHash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=', source: 'ton-blockchain/stablecoin-contract' },
  { id: 'legacy', label: 'Classic minter (minter.ton.org before 2025)', family: 'legacy', metadata: 'content', codeHash: 'mg+Y3W+/Il7vgWXk5kQX7pMffuoABlNDnntdzcBkTNY=', source: 'ton-blockchain/minter-contract' }
]

/** Accepts base64, base64url or hex. */
export function flavorByCodeHash(hash: string | null | undefined): MinterFlavor | null {
  if (!hash) return null
  const h = hash.trim()
  const b64 = /^[0-9a-f]{64}$/i.test(h) ? Buffer.from(h, 'hex').toString('base64') : h.replace(/-/g, '+').replace(/_/g, '/')
  return MINTER_FLAVORS.find(f => f.codeHash === b64) ?? null
}

/** Legacy minter-contract op codes (not TEP numbers; small integers from token-contract). */
export const LEGACY_OP = { mint: 21, changeAdmin: 3, changeContent: 4 } as const

/** Fees, nanoGRAM. v2 values are minter.ton.org's JETTON_V2_* constants; legacy ones its toNano(0.04 / 0.02 / 0.01). */
export const FEES = {
  v2: { deploy: 150_000_000n, mint: 100_000_000n, mintToWallet: 50_000_000n, admin: 50_000_000n },
  legacy: { deploy: 0n, mint: 40_000_000n, mintToWallet: 20_000_000n, admin: 10_000_000n },
  /** forward_ton_amount in the minted internal_transfer: makes the recipient's wallet show the incoming tokens. */
  notify: 1_000_000n
} as const

/** The all-zero address. The classic minter "renounces" admin by setting it (minter.ton.org does the same). */
export const ZERO_ADDRESS = new Address(0, Buffer.alloc(32))

/** Coins are VarUInteger 16: at most 2^120 - 1 base units. */
export const MAX_COINS = (1n << 120n) - 1n

// ---------------------------------------------------------------- TEP-64 content

export interface JettonMetadata {
  name?: string
  symbol?: string
  description?: string
  image?: string
  decimals?: string
}

const ONCHAIN_KEYS = ['name', 'symbol', 'description', 'image', 'decimals'] as const

/** Snake data with the 0x00 prefix, 126 bytes per cell (what minter.ton.org writes, byte for byte). */
function snakeCell(value: string): Cell {
  let bytes = Buffer.from(value, 'utf8')
  const chunks: Buffer[] = []
  do {
    chunks.push(bytes.subarray(0, 126))
    bytes = bytes.subarray(126)
  } while (bytes.length)
  let tail: Cell | null = null
  for (let i = chunks.length - 1; i >= 0; i--) {
    const b = beginCell()
    if (i === 0) b.storeUint(0, 8)
    b.storeBuffer(chunks[i]!)
    if (tail) b.storeRef(tail)
    tail = b.endCell()
  }
  return tail!
}

function metadataKey(name: string): bigint {
  return BigInt(`0x${sha256_sync(Buffer.from(name, 'utf8')).toString('hex')}`)
}

/** TEP-64 on-chain content: 0x00 + dict sha256(key) -> ^snake. Empty values are left out. */
export function buildOnchainContent(meta: JettonMetadata): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  for (const k of ONCHAIN_KEYS) {
    const v = meta[k]?.trim()
    if (v) dict.set(metadataKey(k), snakeCell(v))
  }
  return beginCell().storeUint(0, 8).storeDict(dict).endCell()
}

/** TEP-64 off-chain content: 0x01 + URL (snake). */
export function buildOffchainContent(uri: string): Cell {
  return beginCell().storeUint(1, 8).storeStringTail(uri.trim()).endCell()
}

/** Reads TEP-64 content back (on-chain keys we know, or the off-chain URL). For tests and previews. */
export function readContent(cell: Cell): { kind: 'onchain', meta: JettonMetadata } | { kind: 'offchain', uri: string } {
  const s = cell.beginParse()
  const prefix = s.loadUint(8)
  if (prefix === 1) return { kind: 'offchain', uri: s.loadStringTail() }
  if (prefix !== 0) throw new Error(`Unknown content prefix 0x${prefix.toString(16)}`)
  const dict = s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  const meta: JettonMetadata = {}
  for (const k of ONCHAIN_KEYS) {
    const v = dict.get(metadataKey(k))
    if (!v) continue
    const vs = v.beginParse()
    vs.loadUint(8)
    meta[k] = vs.loadStringTail()
  }
  return { kind: 'onchain', meta }
}

// ---------------------------------------------------------------- metadata form (deployer + admin panel)

export interface MetadataForm {
  name: string
  symbol: string
  decimals: string
  description: string
  image: string
  /** onchain: stored in the contract. offchain: a TEP-64 JSON file hosted at `uri`. */
  mode: 'onchain' | 'offchain'
  uri: string
}

export type MetadataErrors = Partial<Record<keyof MetadataForm, string>>

const URL_RE = /^(https:\/\/|ipfs:\/\/)[\x21-\x7e]+$/

/** Validates the form and builds the TEP-64 content cell. `decimals` falls back to 9 when invalid. */
export function validateMetadata(f: MetadataForm): { errors: MetadataErrors, content?: Cell, decimals: number } {
  const errors: MetadataErrors = {}
  const n = Number(f.decimals)
  if (!/^\d{1,2}$/.test(f.decimals.trim()) || n > 18) errors.decimals = 'Use a whole number from 0 to 18 (9 is the usual choice).'
  const decimals = errors.decimals ? 9 : n

  if (f.mode === 'offchain') {
    if (!URL_RE.test(f.uri.trim())) errors.uri = 'Enter the https:// or ipfs:// link to your metadata JSON.'
  }
  else {
    if (!f.name.trim()) errors.name = 'Give your token a name.'
    else if (f.name.trim().length > 64) errors.name = 'Keep the name under 64 characters.'
    if (!f.symbol.trim()) errors.symbol = 'Enter a ticker, e.g. MYT.'
    else if (f.symbol.trim().length > 16) errors.symbol = 'Keep the symbol under 16 characters.'
    else if (/\s/.test(f.symbol.trim())) errors.symbol = 'No spaces in the symbol.'
    if (f.image.trim() && !URL_RE.test(f.image.trim())) errors.image = 'Use a direct https:// (or ipfs://) link to a PNG, JPG, WEBP or SVG.'
    if (f.description.length > 500) errors.description = 'Keep the description under 500 characters.'
  }
  if (Object.keys(errors).length) return { errors, decimals }
  const content = f.mode === 'offchain'
    ? buildOffchainContent(f.uri)
    : buildOnchainContent({ name: f.name, symbol: f.symbol, description: f.description, image: f.image, decimals: String(decimals) })
  return { errors, content, decimals }
}

// ---------------------------------------------------------------- bodies

export interface MintParams {
  family: MinterFamily
  queryId?: bigint
  /** Owner wallet that receives the tokens. */
  to: Address
  /** Token base units. */
  amount: bigint
  /** Where the leftover GRAM goes (the admin). */
  response: Address
  /** nanoGRAM the minter forwards to the new jetton wallet. */
  tonAmount?: bigint
}

/** mint#642b7d07 (v2) / mint#15 (classic): to, ton_amount, ^internal_transfer(amount, from=none, response, forward 0.001). */
export function mintBody(p: MintParams): Cell {
  const q = p.queryId ?? 0n
  const transfer = beginCell()
    .storeUint(OP('jetton_internal_transfer'), 32)
    .storeUint(q, 64)
    .storeCoins(p.amount)
    .storeAddress(null)
    .storeAddress(p.response)
    .storeCoins(FEES.notify)
    .storeBit(0)
    .endCell()
  return beginCell()
    .storeUint(p.family === 'v2' ? OP('jetton_mint') : LEGACY_OP.mint, 32)
    .storeUint(q, 64)
    .storeAddress(p.to)
    .storeCoins(p.tonAmount ?? FEES[p.family].mintToWallet)
    .storeRef(transfer)
    .endCell()
}

/** v2: change_admin#6501f354 (the new admin must claim). Classic: op 3, takes effect at once. */
export function changeAdminBody(family: MinterFamily, newAdmin: Address, queryId = 0n): Cell {
  return beginCell()
    .storeUint(family === 'v2' ? OP('jetton_change_admin') : LEGACY_OP.changeAdmin, 32)
    .storeUint(queryId, 64)
    .storeAddress(newAdmin)
    .endCell()
}

/** claim_admin#fb88e119 (v2 only). */
export function claimAdminBody(queryId = 0n): Cell {
  return beginCell().storeUint(OP('jetton_claim_admin'), 32).storeUint(queryId, 64).endCell()
}

/** v2: drop_admin#7431f221. Classic: change_admin to the zero address. Permanent either way. */
export function dropAdminBody(family: MinterFamily, queryId = 0n): Cell {
  if (family === 'legacy') return changeAdminBody('legacy', ZERO_ADDRESS, queryId)
  return beginCell().storeUint(0x7431f221, 32).storeUint(queryId, 64).endCell()
}

/**
 * Change metadata.
 * - v2.1: change_metadata#cb862902 query_id ^content (full TEP-64 content cell).
 * - Jetton 2.0 / stablecoin: change_metadata_uri#cb862902 query_id uri (snake bytes, inline).
 * - Classic: change_content#4 query_id ^content.
 */
export function changeMetadataBody(flavor: Pick<MinterFlavor, 'family' | 'metadata'>, content: Cell | string, queryId = 0n): Cell {
  if (flavor.family === 'legacy') {
    if (typeof content === 'string') throw new Error('The classic minter takes a content cell')
    return beginCell().storeUint(LEGACY_OP.changeContent, 32).storeUint(queryId, 64).storeRef(content).endCell()
  }
  const b = beginCell().storeUint(OP('jetton_change_metadata_uri'), 32).storeUint(queryId, 64)
  if (flavor.metadata === 'uri') {
    if (typeof content !== 'string') throw new Error('This minter only stores a metadata URL')
    return b.storeStringTail(content.trim()).endCell()
  }
  if (typeof content === 'string') throw new Error('This minter takes a content cell')
  return b.storeRef(content).endCell()
}

// ---------------------------------------------------------------- deploy (v2.1)

export interface DeployParams {
  owner: Address
  content: Cell
  /** Initial supply in base units, minted to the owner. */
  mintAmount: bigint
  queryId?: bigint
  workchain?: number
}

export interface DeployPlan {
  address: Address
  stateInit: Cell
  body: Cell
  value: bigint
}

/** minter_storage: total_supply=0, admin=owner, next_admin=none, ^content. */
export function v21MinterData(owner: Address, content: Cell): Cell {
  return beginCell().storeCoins(0).storeAddress(owner).storeAddress(null).storeRef(content).endCell()
}

/** One message: deploys the v2.1 minter and mints the initial supply to the owner (exactly what minter.ton.org sends). */
export function planDeploy(p: DeployParams): DeployPlan {
  const init: StateInit = { code: Cell.fromBase64(JETTON_V21_MINTER_CODE_B64), data: v21MinterData(p.owner, p.content) }
  return {
    address: contractAddress(p.workchain ?? 0, init),
    stateInit: beginCell().store(storeStateInit(init)).endCell(),
    body: mintBody({ family: 'v2', queryId: p.queryId, to: p.owner, amount: p.mintAmount, response: p.owner }),
    value: FEES.v2.deploy
  }
}
