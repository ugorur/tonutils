// TEP-64 token content + TEP-66 royalty cells, shared by the nfts-write tools.
// Imports @ton/*: use from Tool.vue / logic.ts only (client + vitest).
import { Address, beginCell, Cell, Dictionary, type Slice } from '@ton/core'
import { sha256_sync } from '@ton/crypto'

export const OFFCHAIN_TAG = 0x01
export const ONCHAIN_TAG = 0x00
/** Bytes per snake cell (1016 of 1023 bits), the split getgems and most SDKs use. */
const SNAKE_BYTES = 127

const utf8 = new TextEncoder()
const toBuf = (v: string | Uint8Array) => Buffer.from(typeof v === 'string' ? utf8.encode(v) : v)

/** Snake cell chain: data in 127-byte chunks, continued in ref 0. An optional tag byte goes first. */
export function snakeCell(data: string | Uint8Array, tag?: number): Cell {
  const bytes = tag === undefined ? toBuf(data) : Buffer.concat([Buffer.from([tag]), toBuf(data)])
  const chunks: Buffer[] = []
  for (let i = 0; i < bytes.length; i += SNAKE_BYTES) chunks.push(bytes.subarray(i, i + SNAKE_BYTES))
  let cell: Cell | null = null
  for (const chunk of chunks.reverse()) {
    const b = beginCell().storeBuffer(chunk)
    if (cell) b.storeRef(cell)
    cell = b.endCell()
  }
  return cell ?? beginCell().endCell()
}

/** Bytes of a snake chain (cell bits + ref 0 chain). Throws when a cell is not byte-aligned. */
export function readSnake(cell: Cell | Slice): Buffer {
  const parts: Buffer[] = []
  let s: Slice | null = 'beginParse' in cell ? cell.beginParse() : cell
  while (s) {
    if (s.remainingBits % 8) throw new Error('Not byte-aligned snake data')
    parts.push(s.loadBuffer(s.remainingBits / 8))
    s = s.remainingRefs ? s.loadRef().beginParse() : null
  }
  return Buffer.concat(parts)
}

const decodeUtf8 = (b: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(b)

/** Off-chain content: 0x01 + URL (snake). */
export function offchainContent(uri: string): Cell {
  return snakeCell(uri.trim(), OFFCHAIN_TAG)
}

/** TEP-64 attribute keys (and a few widespread NFT ones), so their sha256 keys can be named when decoding. */
export const KNOWN_KEYS = [
  'uri', 'name', 'description', 'image', 'image_data', 'symbol', 'decimals', 'amount_style', 'render_type',
  'cover_image', 'social_links', 'attributes', 'lottie', 'content_url', 'content_type', 'marketplace', 'external_url'
] as const

export const keyHash = (key: string): Buffer => sha256_sync(key)
const KEY_BY_HASH = new Map(KNOWN_KEYS.map(k => [keyHash(k).toString('hex'), k]))

/** On-chain content: 0x00 + HashmapE 256 sha256(key) -> ^(0x00 + snake value). Empty values are skipped. */
export function onchainContent(fields: Record<string, string>): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
  for (const [k, v] of Object.entries(fields)) {
    if (v.trim() === '') continue
    dict.set(keyHash(k), snakeCell(k === 'image_data' ? Buffer.from(v, 'base64') : v, 0x00))
  }
  return beginCell().storeUint(ONCHAIN_TAG, 8).storeDict(dict).endCell()
}

/** Same on-chain content with one field replaced (or removed when empty); every other entry is kept byte for byte. */
export function setOnchainField(content: Cell, key: string, value: string): Cell {
  const s = content.beginParse()
  if (s.loadUint(8) !== ONCHAIN_TAG) throw new Error('Not on-chain content')
  const dict = s.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
  if (value.trim()) dict.set(keyHash(key), snakeCell(value, 0x00))
  else dict.delete(keyHash(key))
  return beginCell().storeUint(ONCHAIN_TAG, 8).storeDict(dict).endCell()
}

/** One on-chain value: 0x00 snake or 0x01 chunked (HashmapE 32 -> ^snake). */
function readOnchainValue(cell: Cell): Buffer {
  const s = cell.beginParse()
  if (s.remainingBits < 8) return readSnake(s)
  const tag = s.loadUint(8)
  if (tag === 0x00) return readSnake(s)
  if (tag === 0x01) {
    const chunks = s.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
    return Buffer.concat([...chunks.keys()].sort((a, b) => a - b).map(i => readSnake(chunks.get(i)!)))
  }
  throw new Error(`Unknown value tag 0x${tag.toString(16)}`)
}

export interface OnchainField {
  /** Attribute name when the sha256 key is a known one, else null. */
  key: string | null
  keyHash: string
  /** UTF-8 text, or null for binary values (then see hex). */
  text: string | null
  hex: string
}

export type DecodedContent =
  | { kind: 'offchain', uri: string }
  | { kind: 'onchain', fields: OnchainField[], uri?: string }

/** Decodes a TEP-64 content cell (0x01 off-chain URL or 0x00 on-chain dictionary). Throws on anything else. */
export function decodeContent(cell: Cell): DecodedContent {
  const s = cell.beginParse()
  if (s.remainingBits < 8) throw new Error('Content cell is shorter than its 8-bit tag')
  const tag = s.loadUint(8)
  if (tag === OFFCHAIN_TAG) return { kind: 'offchain', uri: decodeUtf8(readSnake(s)) }
  if (tag !== ONCHAIN_TAG) throw new Error(`Unknown content tag 0x${tag.toString(16).padStart(2, '0')} (TEP-64 uses 0x00 on-chain or 0x01 off-chain)`)
  const dict = s.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
  const fields: OnchainField[] = []
  for (const [k, v] of dict) {
    const hash = k.toString('hex')
    const bytes = readOnchainValue(v)
    let text: string | null = null
    try {
      text = decodeUtf8(bytes)
    }
    catch { /* binary, e.g. image_data */ }
    fields.push({ key: KEY_BY_HASH.get(hash) ?? null, keyHash: hash, text, hex: bytes.toString('hex') })
  }
  const uri = fields.find(f => f.key === 'uri')?.text ?? undefined
  return { kind: 'onchain', fields, uri }
}

/** Plain text of a snake cell without a tag (common_content, individual item content). */
export function snakeText(cell: Cell): string {
  return decodeUtf8(readSnake(cell))
}

// ---------------------------------------------------------------- collection content wrapper

/** Collection storage content: ^[collection_content:^Cell common_content:^Cell] (standard nft-collection). */
export function collectionContentCell(collectionContent: Cell, commonContent: string): Cell {
  return beginCell().storeRef(collectionContent).storeRef(snakeCell(commonContent)).endCell()
}

/** Item content as stored by a standard item: the URL suffix appended to common_content (no tag). */
export function itemContentCell(suffix: string): Cell {
  return snakeCell(suffix)
}

/** URL a standard collection's get_nft_content returns: common_content + individual suffix. Relative suffixes only. */
export function joinItemUrl(common: string, suffix: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(suffix) ? suffix : common + suffix
}

// ---------------------------------------------------------------- royalty (TEP-66)

export interface Royalty {
  numerator: number
  denominator: number
  destination: Address
}

/** royalty_params numerator:uint16 denominator:uint16 destination:MsgAddress */
export function royaltyCell(r: Royalty): Cell {
  if (!Number.isInteger(r.numerator) || r.numerator < 0 || r.numerator > 0xffff) throw new Error('Royalty numerator must be 0…65535')
  if (!Number.isInteger(r.denominator) || r.denominator < 1 || r.denominator > 0xffff) throw new Error('Royalty denominator must be 1…65535')
  if (r.numerator > r.denominator) throw new Error('Royalty cannot be more than 100%')
  return beginCell().storeUint(r.numerator, 16).storeUint(r.denominator, 16).storeAddress(r.destination).endCell()
}

export function parseRoyalty(cell: Cell): Royalty {
  const s = cell.beginParse()
  const r = { numerator: s.loadUint(16), denominator: s.loadUint(16), destination: s.loadAddress() }
  if (r.denominator === 0) throw new Error('Royalty denominator is 0')
  return r
}

/** "5" or "2.5" percent -> numerator/1000 (getgems uses a denominator of 1000). */
export function royaltyFromPercent(percent: string, destination: Address): Royalty {
  const t = percent.trim() || '0'
  if (!/^\d+(\.\d)?$/.test(t)) throw new Error('Use a percentage with at most one decimal, e.g. 5 or 2.5')
  const numerator = Math.round(Number(t) * 10)
  if (numerator > 1000) throw new Error('Royalty cannot be more than 100%')
  return { numerator, denominator: 1000, destination }
}

export const royaltyPercent = (r: { numerator: number, denominator: number }) => (r.numerator / r.denominator) * 100
/** "2.2%" (float noise removed). */
export const royaltyLabel = (r: { numerator: number, denominator: number }) => `${royaltyPercent(r).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`

// ---------------------------------------------------------------- auto-detect

export type DetectedCell =
  | { kind: 'content', content: DecodedContent }
  | { kind: 'collection-wrapper', content: DecodedContent | { error: string }, common: string }
  | { kind: 'royalty', royalty: Royalty }
  | { kind: 'text', text: string }

/** Guesses what an NFT-related cell is: TEP-64 content, collection content wrapper, royalty params or a plain URL suffix. */
export function detectCell(cell: Cell): DetectedCell {
  if (cell.bits.length === 0 && cell.refs.length === 2) {
    let content: DecodedContent | { error: string }
    try {
      content = decodeContent(cell.refs[0]!)
    }
    catch (e) {
      content = { error: (e as Error).message }
    }
    return { kind: 'collection-wrapper', content, common: snakeText(cell.refs[1]!) }
  }
  // 16 + 16 + addr_std (267) or addr_none (2)
  if (cell.refs.length === 0 && (cell.bits.length === 299 || cell.bits.length === 34)) {
    try {
      return { kind: 'royalty', royalty: parseRoyalty(cell) }
    }
    catch { /* fall through */ }
  }
  try {
    return { kind: 'content', content: decodeContent(cell) }
  }
  catch (e) {
    try {
      return { kind: 'text', text: snakeText(cell) }
    }
    catch {
      throw e
    }
  }
}
