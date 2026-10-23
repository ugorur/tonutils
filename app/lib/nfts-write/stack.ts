// toncenter v3 get-method stack helpers + readers for standard NFT getters, shared by the nfts-write tools.
// Imports @ton/core: use from Tool.vue / logic.ts only.
import { Address, beginCell, Cell } from '@ton/core'
import { accountStates, runGetMethod, type StackEntry } from './chain'
import { decodeContent, type DecodedContent } from './content'

// ---------------------------------------------------------------- toncenter v3 stack values

export function stackNum(e: StackEntry | undefined): bigint {
  if (!e || e.type !== 'num') throw new Error(`Expected a number on the stack, got ${e?.type ?? 'nothing'}`)
  const v = String(e.value)
  return v.startsWith('-') ? -BigInt(v.slice(1)) : BigInt(v)
}

export function stackCell(e: StackEntry | undefined): Cell {
  if (!e || (e.type !== 'cell' && e.type !== 'slice')) throw new Error(`Expected a cell on the stack, got ${e?.type ?? 'nothing'}`)
  return Cell.fromBase64(String(e.value))
}

/** MsgAddress returned as a slice; null for addr_none. */
export function stackAddress(e: StackEntry | undefined): Address | null {
  const s = stackCell(e).beginParse()
  const a = s.loadAddressAny()
  return a && Address.isAddress(a) ? a : null
}

export const numArg = (n: bigint): StackEntry => ({ type: 'num', value: `0x${n.toString(16)}` })
export const cellArg = (c: Cell): StackEntry => ({ type: 'cell', value: c.toBoc().toString('base64') })
export const EMPTY_CELL = beginCell().endCell()

// ---------------------------------------------------------------- results

export interface NftItemData {
  init: boolean
  index: bigint
  collection: Address | null
  owner: Address | null
  individual: Cell
}

/** get_nft_data() -> (init?, index, collection_address, owner_address, individual_content) */
export function parseNftData(stack: StackEntry[]): NftItemData {
  return {
    init: stackNum(stack[0]) !== 0n,
    index: stackNum(stack[1]),
    collection: stackAddress(stack[2]),
    owner: stackAddress(stack[3]),
    individual: stackCell(stack[4])
  }
}

export interface CollectionData {
  nextItemIndex: bigint
  content: Cell
  owner: Address | null
}

/** get_collection_data() -> (next_item_index, collection_content, owner_address) */
export function parseCollectionData(stack: StackEntry[]): CollectionData {
  return { nextItemIndex: stackNum(stack[0]), content: stackCell(stack[1]), owner: stackAddress(stack[2]) }
}

/** royalty_params() -> (numerator, denominator, destination) */
export function parseRoyaltyStack(stack: StackEntry[]) {
  const numerator = Number(stackNum(stack[0]))
  const denominator = Number(stackNum(stack[1]))
  return { numerator, denominator, destination: stackAddress(stack[2]) }
}

// ---------------------------------------------------------------- collection snapshot

export interface CollectionInfo extends CollectionData {
  address: Address
  decoded: DecodedContent | null
  /** get_nft_content(0, empty): the off-chain common prefix, when the collection has one. */
  common: string | null
  royalty: { numerator: number, denominator: number, destination: Address | null } | null
  codeHash: string | null
  status: string
}

type V3 = Parameters<typeof accountStates>[0]

/** Reads everything needed to mint into / manage a collection (4 toncenter calls, queued). */
export async function readCollection(baseUrl: string, v3: V3, address: Address, onStage?: (s: string) => void): Promise<CollectionInfo> {
  const raw = address.toRawString()
  onStage?.('Reading the contract state…')
  const st = (await accountStates(v3, [raw])).get(raw.toUpperCase())
  if (!st || st.status !== 'active') throw new Error(st?.status === 'uninit' || !st ? 'Nothing is deployed at this address on this network.' : `This account is ${st.status}.`)
  onStage?.('Reading get_collection_data…')
  const col = parseCollectionData(await runGetMethod(baseUrl, raw, 'get_collection_data'))
  let decoded: DecodedContent | null = null
  try {
    decoded = decodeContent(col.content)
  }
  catch { /* non-standard content */ }
  onStage?.('Reading royalty_params…')
  let royalty: CollectionInfo['royalty'] = null
  try {
    royalty = parseRoyaltyStack(await runGetMethod(baseUrl, raw, 'royalty_params'))
  }
  catch (e) {
    if ((e as Error).name === 'TonApiError') throw e
  }
  onStage?.('Reading the common item URL…')
  let common: string | null = null
  try {
    const s = await runGetMethod(baseUrl, raw, 'get_nft_content', [numArg(0n), cellArg(EMPTY_CELL)])
    const d = decodeContent(stackCell(s[0]))
    common = d.kind === 'offchain' ? d.uri : null
  }
  catch (e) {
    if ((e as Error).name === 'TonApiError') throw e
  }
  return { ...col, address, decoded, common, royalty, codeHash: st.code_hash ?? null, status: st.status }
}
