// TEP-64 token metadata: decode and encode content cells, plus the validation rules wallets care about.
// Shared by jetton-metadata-codec and metadata-validator. Imports @ton/*: client / logic.ts only.
//
// content#_ := onchain#00 data:(HashmapE 256 ^ContentData) | offchain#01 uri:Text
// ContentData := snake#00 data:(SnakeData ~n) | chunks#01 data:(HashmapE 32 ^(SnakeData ~0))
// Keys are sha256(key name). "Semi-chain" = on-chain dict that also holds a `uri` key (off-chain JSON fills the rest).
import { ipfsToHttp } from '~/utils/ipfs'
import { Cell, Dictionary, beginCell } from '@ton/core'
import { sha256_sync } from '@ton/crypto'
import { decodeSnake, encodeSnake } from '~/tools/snake-string-codec/logic'

/** TEP-64 jetton/NFT keys plus widely used extras (TEP-177 mintless, social links, lottie). */
export const KNOWN_KEYS = [
  'uri', 'name', 'description', 'image', 'image_data', 'symbol', 'decimals', 'amount_style', 'render_type',
  'content_url', 'content_type', 'cover_image', 'social_links', 'social', 'websites', 'attributes', 'lottie',
  'external_url', 'marketplace', 'custom_payload_api_uri', 'mintless_merkle_dump_uri'
] as const

/** Keys whose on-chain value is binary, shown as base64 (TEP-64: image_data is raw bytes on-chain, base64 off-chain). */
const BINARY_KEYS = new Set(['image_data'])

export function keyHash(key: string): bigint {
  return BigInt('0x' + sha256_sync(key).toString('hex'))
}
const hashHex = (h: bigint) => h.toString(16).padStart(64, '0')
const KEY_BY_HASH = new Map<string, string>(KNOWN_KEYS.map(k => [hashHex(keyHash(k)), k]))

export type Layout = 'onchain' | 'semichain' | 'offchain'
/** snake: data starts in the value cell. snake-ref: the value cell holds only 0x00 and the text starts in ref 0 (Tact/HMSTR style). */
export type ValueFormat = 'snake' | 'snake-ref' | 'chunked'

export interface ContentEntry {
  /** Key name when it is a known key, else null (only the sha256 is on chain). */
  key: string | null
  hash: string
  format: ValueFormat | 'unknown'
  bytes: Uint8Array
  /** Display value: UTF-8 text, base64 for image_data, or 0x-hex when the bytes are not text. */
  value: string
  isText: boolean
}

export interface DecodedContent {
  layout: Layout
  /** Off-chain JSON URI (offchain layout or the `uri` key). */
  uri: string | null
  entries: ContentEntry[]
  /** Known keys as a TEP-64 JSON object (what the token's metadata says on chain). */
  json: Record<string, string>
  warnings: string[]
}

const utf8 = (b: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  }
  catch {
    return null
  }
}

function decodeValue(cell: Cell): { format: ContentEntry['format'], bytes: Uint8Array } {
  const s = cell.beginParse()
  const prefix = s.remainingBits >= 8 ? s.preloadUint(8) : -1
  if (prefix === 0) return { format: s.remainingBits === 8 && cell.refs.length ? 'snake-ref' : 'snake', bytes: decodeSnake(cell, 'snake').bytes }
  if (prefix === 1) return { format: 'chunked', bytes: decodeSnake(cell, 'chunked').bytes }
  // Non-standard: no prefix. Read it as plain snake bytes so the user still sees something.
  return { format: 'unknown', bytes: decodeSnake(cell, 'none').bytes }
}

/** Decodes a TEP-64 content cell. Throws Error with a readable message on a malformed cell. */
export function decodeContent(cell: Cell): DecodedContent {
  const s = cell.beginParse()
  if (s.remainingBits < 8) throw new Error('The content cell is empty: TEP-64 content starts with a 0x00 (on-chain) or 0x01 (off-chain) byte')
  const prefix = s.preloadUint(8)
  const warnings: string[] = []

  if (prefix === 1) {
    const bytes = decodeSnake(cell, 'none').bytes.subarray(1)
    const uri = utf8(bytes)
    if (uri === null) throw new Error('Off-chain content: the URI is not valid UTF-8')
    if (uri !== uri.trim()) warnings.push('The URI has leading or trailing whitespace')
    return { layout: 'offchain', uri, entries: [], json: { uri }, warnings }
  }
  if (prefix !== 0) throw new Error(`Unknown content prefix 0x${prefix.toString(16).padStart(2, '0')}: TEP-64 allows only 0x00 (on-chain) and 0x01 (off-chain)`)

  s.skip(8)
  let dict: Dictionary<bigint, Cell>
  try {
    dict = s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  }
  catch (e) {
    throw new Error(`On-chain content: the key/value dictionary could not be parsed (${(e as Error).message})`)
  }
  if (s.remainingBits || s.remainingRefs) warnings.push('Extra data after the dictionary is ignored by wallets')

  const entries: ContentEntry[] = []
  const json: Record<string, string> = {}
  for (const [h, v] of dict) {
    const hash = hashHex(h)
    const key = KEY_BY_HASH.get(hash) ?? null
    const { format, bytes } = decodeValue(v)
    const text = utf8(bytes)
    const binary = key !== null && BINARY_KEYS.has(key)
    const value = binary ? Buffer.from(bytes).toString('base64') : text ?? `0x${Buffer.from(bytes).toString('hex')}`
    if (format === 'unknown') warnings.push(`Value of ${key ?? hash.slice(0, 12) + '…'} has no 0x00/0x01 prefix (not TEP-64)`)
    entries.push({ key, hash, format, bytes, value, isText: text !== null && !binary })
    if (key) json[key] = value
  }
  entries.sort((a, b) => (a.key ?? '~' + a.hash).localeCompare(b.key ?? '~' + b.hash))
  const uri = json.uri ?? null
  return { layout: uri ? 'semichain' : 'onchain', uri, entries, json, warnings }
}

function encodeValue(bytes: Uint8Array, format: ValueFormat): Cell {
  if (format === 'snake-ref') return beginCell().storeUint(0, 8).storeRef(encodeSnake(bytes, 'none')).endCell()
  return encodeSnake(bytes, format)
}

/** Off-chain content: 0x01 + URI as snake text. */
export function encodeOffchain(uri: string): Cell {
  const bytes = new TextEncoder().encode(uri.trim())
  return encodeSnake(Uint8Array.from([1, ...bytes]), 'none')
}

/**
 * On-chain content (0x00 + dict). `fields` are TEP-64 key -> string; `image_data` is base64 and stored as raw bytes.
 * Any key name is allowed (stored under sha256(name)). Empty values are skipped.
 */
export function encodeOnchain(fields: Record<string, string>, format: ValueFormat = 'snake'): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  for (const [k, v] of Object.entries(fields)) {
    if (v === '') continue
    const bytes = BINARY_KEYS.has(k) ? base64Bytes(v, k) : new TextEncoder().encode(v)
    dict.set(keyHash(k), encodeValue(bytes, format))
  }
  return beginCell().storeUint(0, 8).storeDict(dict).endCell()
}

function base64Bytes(v: string, key: string): Uint8Array {
  const s = v.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) throw new Error(`${key} must be base64 (TEP-64 stores the raw image bytes on chain)`)
  return Uint8Array.from(Buffer.from(s, 'base64'))
}

/**
 * Turns a metadata JSON text into string fields for encodeOnchain. Numbers/booleans become strings
 * (TEP-64 values are UTF-8 strings); arrays/objects are kept as JSON text with a warning.
 */
export function parseMetadataJson(text: string): { fields: Record<string, string>, warnings: string[] } {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  }
  catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`)
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Metadata must be a JSON object, e.g. { "name": "My token" }')
  const fields: Record<string, string> = {}
  const warnings: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string') fields[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') fields[k] = String(v)
    else {
      fields[k] = JSON.stringify(v)
      warnings.push(`"${k}" is stored as JSON text; most wallets only read plain string values on chain`)
    }
  }
  return { fields, warnings }
}

// ---------------------------------------------------------------- URLs

/** ipfs://CID/path -> the shared gateway (~/utils/ipfs; tonapi resolves ipfs:// itself); other URLs unchanged. */
export function resolveUri(uri: string): string {
  return ipfsToHttp(uri)
}

export function uriScheme(uri: string): 'https' | 'http' | 'ipfs' | 'data' | 'other' {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(uri.trim())
  const s = m?.[1]?.toLowerCase()
  return s === 'https' || s === 'http' || s === 'ipfs' || s === 'data' ? s : 'other'
}

// ---------------------------------------------------------------- validation

export type MetaKind = 'jetton' | 'nft-item' | 'nft-collection'
export type CheckLevel = 'ok' | 'warn' | 'error' | 'info'
export interface Check { level: CheckLevel, title: string, detail?: string }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** Checks a merged metadata object (on-chain keys override off-chain JSON) against TEP-64 and what wallets need. */
export function validateMetadata(kind: MetaKind, meta: Record<string, unknown>): Check[] {
  const out: Check[] = []
  const need = (key: string, why: string, level: CheckLevel = 'error') => {
    if (isStr(meta[key])) out.push({ level: 'ok', title: `${key} is set`, detail: String(meta[key]).slice(0, 120) })
    else if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') out.push({ level: 'error', title: `${key} must be a string`, detail: `Got ${typeof meta[key]}. ${why}` })
    else out.push({ level, title: `${key} is missing`, detail: why })
  }

  need('name', kind === 'jetton' ? 'Wallets show it as the token name.' : 'Marketplaces and wallets show it as the title.')
  if (kind === 'jetton') {
    need('symbol', 'Wallets show it next to the balance (e.g. USD₮).')
    const d = meta.decimals
    if (d === undefined || d === null || d === '') {
      out.push({ level: 'warn', title: 'decimals is missing, wallets assume 9', detail: 'Set it explicitly if your token does not use 9 decimals, or every balance will display wrong.' })
    }
    else if (typeof d === 'number') {
      out.push({ level: 'warn', title: 'decimals is a number, TEP-64 says string', detail: `Write "decimals": "${d}". Most indexers accept a number, but not all.` })
    }
    else if (typeof d !== 'string' || !/^\d{1,3}$/.test(d) || Number(d) > 255) {
      out.push({ level: 'error', title: 'decimals is not a whole number from 0 to 255', detail: `Got ${JSON.stringify(d)}.` })
    }
    else out.push({ level: 'ok', title: `decimals is ${d}` })
    for (const [key, allowed] of [['amount_style', ['n', 'n-of-total', '%']], ['render_type', ['currency', 'game']]] as const) {
      if (meta[key] !== undefined && !(allowed as readonly string[]).includes(String(meta[key]))) {
        out.push({ level: 'warn', title: `${key} has an unknown value`, detail: `TEP-64 allows ${allowed.map(a => `"${a}"`).join(', ')}.` })
      }
    }
  }
  need('description', 'Shown on the token page; optional but recommended.', 'warn')

  const img = meta.image
  if (isStr(img)) {
    const sc = uriScheme(img)
    if (sc === 'https' || sc === 'ipfs') out.push({ level: 'ok', title: `image is an ${sc === 'ipfs' ? 'IPFS' : 'HTTPS'} link` })
    else if (sc === 'http') out.push({ level: 'warn', title: 'image uses plain http', detail: 'Some wallets refuse insecure images. Use https.' })
    else if (sc === 'data') out.push({ level: 'warn', title: 'image is a data: URI', detail: 'Use image_data for embedded images, or host the file and link it.' })
    else out.push({ level: 'error', title: 'image is not an https or ipfs link', detail: img.slice(0, 120) })
  }
  else if (isStr(meta.image_data)) out.push({ level: 'ok', title: 'image_data is set (embedded image)' })
  else out.push({ level: 'error', title: 'No image or image_data', detail: 'Wallets show a placeholder icon without one of them.' })

  if (kind === 'nft-item' && meta.attributes !== undefined) {
    const a = meta.attributes
    const ok = Array.isArray(a) && a.every(x => x && typeof x === 'object' && 'trait_type' in x && 'value' in x)
    out.push(ok
      ? { level: 'ok', title: `attributes: ${(a as unknown[]).length} traits` }
      : { level: 'warn', title: 'attributes are not [{ trait_type, value }]', detail: 'Marketplaces such as Getgems read traits in this shape.' })
  }
  if (kind === 'nft-collection' && meta.cover_image === undefined) {
    out.push({ level: 'info', title: 'No cover_image', detail: 'Optional: marketplaces show it as the collection banner.' })
  }
  return out
}
