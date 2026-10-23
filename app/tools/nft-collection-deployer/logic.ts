// NFT collection deploy / mint / manage for the standard getgems nft-collection-editable + nft-item contracts.
// Layouts follow the contract sources (getgems-io/nft-contracts, packages/contracts/sources/nft-collection-editable.fc).
import { Address, beginCell, Cell, contractAddress, Dictionary, type DictionaryValue, storeStateInit } from '@ton/core'
import { collectionContentCell, itemContentCell, royaltyCell, type Royalty } from '~/lib/nfts-write/content'
import { COLLECTION_CODE_B64, ITEM_CODE_B64 } from '~/lib/nfts-write/getgems'

export const COLLECTION_CODE = Cell.fromBase64(COLLECTION_CODE_B64)
export const ITEM_CODE = Cell.fromBase64(ITEM_CODE_B64)

export const OP_MINT = 1
export const OP_BATCH_MINT = 2
export const OP_CHANGE_OWNER = 3
export const OP_EDIT_CONTENT = 4

/**
 * Items per batch message. The contract allows 249 (it throws 399 on the 250th), but the dictionary walk costs
 * more gas per item as the batch grows: 100 items use ~755k of the 1M gas cap in the sandbox, ~130 is the ceiling.
 */
export const MAX_BATCH = 100

/** nanoGRAM: what each new item keeps as its balance (the item reserves 0.05 for storage on transfers). */
export const ITEM_AMOUNT = 50_000_000n
/** nanoGRAM: collection-side gas + forwarding per minted item (sandbox with the mainnet config: ~0.001; 3x margin). */
export const PER_ITEM_FEE = 3_000_000n
/** nanoGRAM: fixed margin per mint message. Unused value stays in the collection (this contract has no withdraw). */
export const MINT_BASE_FEE = 10_000_000n
/** nanoGRAM sent with the deploy: the collection's storage reserve. */
export const DEPLOY_AMOUNT = 50_000_000n
/** nanoGRAM for owner / content changes (compute only). */
export const ADMIN_AMOUNT = 20_000_000n

export interface CollectionParams {
  owner: Address
  /** TEP-64 collection content (off-chain URL or on-chain dictionary). */
  content: Cell
  /** Base URL that item suffixes are appended to, e.g. https://example.com/nft/ */
  commonContent: string
  royalty: Royalty
  nextItemIndex?: bigint
}

/** storage#_ owner:MsgAddress next_item_index:uint64 ^[collection_content common_content] nft_item_code:^Cell royalty_params:^Cell */
export function collectionData(p: CollectionParams): Cell {
  return beginCell()
    .storeAddress(p.owner)
    .storeUint(p.nextItemIndex ?? 0n, 64)
    .storeRef(collectionContentCell(p.content, p.commonContent))
    .storeRef(ITEM_CODE)
    .storeRef(royaltyCell(p.royalty))
    .endCell()
}

export function collectionStateInit(p: CollectionParams, workchain = 0) {
  const init = { code: COLLECTION_CODE, data: collectionData(p) }
  return { init, stateInit: beginCell().store(storeStateInit(init)).endCell(), address: contractAddress(workchain, init) }
}

/** Item address the collection derives: StateInit(item code, data = index:uint64 + collection address). */
export function itemAddress(collection: Address, index: bigint, itemCode: Cell = ITEM_CODE): Address {
  const data = beginCell().storeUint(index, 64).storeAddress(collection).endCell()
  return contractAddress(collection.workChain, { code: itemCode, data })
}

export interface MintItem {
  index: bigint
  owner: Address
  /** URL suffix appended to the collection's common content, e.g. "0.json". */
  content: string
  /** nanoGRAM forwarded to the new item. */
  amount: bigint
}

/** What the collection forwards to the item on deploy: owner_address + ^individual_content. */
function itemInit(owner: Address, content: string): Cell {
  return beginCell().storeAddress(owner).storeRef(itemContentCell(content)).endCell()
}

/** deploy_new_nft op=1: query_id item_index:uint64 amount:Coins nft_content:^Cell */
export function mintBody(item: MintItem, queryId = 0n): Cell {
  return beginCell()
    .storeUint(OP_MINT, 32)
    .storeUint(queryId, 64)
    .storeUint(item.index, 64)
    .storeCoins(item.amount)
    .storeRef(itemInit(item.owner, item.content))
    .endCell()
}

const batchValue: DictionaryValue<{ amount: bigint, init: Cell }> = {
  serialize: (v, b) => b.storeCoins(v.amount).storeRef(v.init),
  parse: s => ({ amount: s.loadCoins(), init: s.loadRef() })
}

/** batch_deploy op=2: query_id deploy_list:^(HashmapE 64 -> amount:Coins ^nft_content) */
export function batchMintBody(items: MintItem[], queryId = 0n): Cell {
  if (!items.length) throw new Error('No items to mint')
  if (items.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} items per message`)
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(64), batchValue)
  for (const it of items) dict.set(it.index, { amount: it.amount, init: itemInit(it.owner, it.content) })
  return beginCell().storeUint(OP_BATCH_MINT, 32).storeUint(queryId, 64).storeRef(beginCell().storeDictDirect(dict).endCell()).endCell()
}

/** op=3: query_id new_owner:MsgAddress */
export function changeOwnerBody(newOwner: Address, queryId = 0n): Cell {
  return beginCell().storeUint(OP_CHANGE_OWNER, 32).storeUint(queryId, 64).storeAddress(newOwner).endCell()
}

/** op=4 (editable only): query_id ^[collection_content common_content] ^royalty_params */
export function editContentBody(content: Cell, commonContent: string, royalty: Royalty, queryId = 0n): Cell {
  return beginCell()
    .storeUint(OP_EDIT_CONTENT, 32)
    .storeUint(queryId, 64)
    .storeRef(collectionContentCell(content, commonContent))
    .storeRef(royaltyCell(royalty))
    .endCell()
}

/** Value for one mint message: items' own balances + collection fees. */
export function mintMessageValue(items: MintItem[]): bigint {
  return items.reduce((s, i) => s + i.amount, 0n) + BigInt(items.length) * PER_ITEM_FEE + MINT_BASE_FEE
}

/** One message per ≤100 items: op 1 for a single item, op 2 for more. */
export function mintMessages(collection: string, items: MintItem[]) {
  const out: { address: string, amount: bigint, payload: Cell }[] = []
  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const part = items.slice(i, i + MAX_BATCH)
    out.push({ address: collection, amount: mintMessageValue(part), payload: part.length === 1 ? mintBody(part[0]!) : batchMintBody(part) })
  }
  return out
}

export interface ParsedLine { line: number, content: string, owner: Address }
export interface ParseResult { items: MintItem[], errors: string[] }

/**
 * Mint list, one item per line: `<url suffix>` or `<url suffix>, <owner address>`.
 * Items get consecutive indexes from startIndex (the collection's next_item_index).
 */
export function parseMintList(text: string, defaultOwner: Address, startIndex: bigint, amount = ITEM_AMOUNT): ParseResult {
  const items: MintItem[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const [suffix = '', ownerStr, ...rest] = line.split(',').map(s => s.trim())
    if (rest.length) return errors.push(`Line ${i + 1}: too many commas. Use "suffix" or "suffix, owner".`)
    if (!suffix) return errors.push(`Line ${i + 1}: the URL suffix is empty.`)
    if (new TextEncoder().encode(suffix).length > 1000) return errors.push(`Line ${i + 1}: the suffix is too long.`)
    let owner = defaultOwner
    if (ownerStr) {
      try {
        owner = Address.parse(ownerStr)
      }
      catch {
        return errors.push(`Line ${i + 1}: "${ownerStr}" is not a valid TON address.`)
      }
    }
    items.push({ index: startIndex + BigInt(items.length), owner, content: suffix, amount })
  })
  return { items, errors }
}

/** "{i}.json" with i = start … start+count-1, one per line. */
export function numberedList(start: bigint, count: number, pattern = '{i}.json'): string {
  return Array.from({ length: count }, (_, k) => pattern.replaceAll('{i}', String(start + BigInt(k)))).join('\n')
}

/** TEP-64 off-chain collection JSON (what the collection URL should serve). */
export function collectionJson(m: { name: string, description?: string, image?: string, coverImage?: string, links?: string[] }): string {
  const o: Record<string, unknown> = { name: m.name }
  if (m.description) o.description = m.description
  if (m.image) o.image = m.image
  if (m.coverImage) o.cover_image = m.coverImage
  const links = (m.links ?? []).filter(Boolean)
  if (links.length) o.social_links = links
  return JSON.stringify(o, null, 2)
}

/** Decoded get_collection_data + the bits of storage we need to manage a collection. */
export interface CollectionState {
  nextItemIndex: bigint
  owner: Address | null
  /** Standard getgems editable code (op 4 available). */
  editable: boolean
  codeHash: string
}
