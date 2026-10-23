// Cancel / reprice fixed-price NFT listings (Getgems sale contracts v2 … v4r1).
// Layouts and ops follow getgems-io/nft-contracts packages/contracts/sources/nft-fixprice-sale-*.fc.
import { Address, beginCell, Cell } from '@ton/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import { AUCTION_KINDS, SALE_KINDS, type SaleKind, type SaleVersion } from '~/lib/nfts-write/getgems'
import { commentBody } from '~/utils/ton/messages'

export { SALE_KINDS }

export const OP_CANCEL = 3
export const OP_CHANGE_PRICE_V3R3 = 0x6c6c2080
export const OP_CHANGE_PRICE_V4R1 = 0xfd135f7b
/** nanoGRAM sent with a price change. It stays in the sale contract and goes back to the seller on sale or cancel. */
export const REPRICE_AMOUNT = 50_000_000n

export interface SaleState {
  version: SaleVersion
  isComplete: boolean
  nft: Address
  owner: Address | null
  marketplace: Address | null
  /** nanoGRAM. 0 in v4r1 jetton-only listings. */
  price: bigint
  /** v2…v3r3: absolute fee amounts in nanoGRAM. */
  marketplaceFee?: bigint
  royaltyAmount?: bigint
  /** v4r1: fees in percent × 100 000 (applied at sale time), and the jetton price dictionary. */
  feePercent?: number
  royaltyPercent?: number
  jettonPrices?: Cell | null
}

const addrOrNull = (a: ReturnType<ReturnType<Cell['beginParse']>['loadAddressAny']>) => (a && Address.isAddress(a) ? a : null)

/** Parses the persistent data of a known sale contract. */
export function parseSaleData(version: SaleVersion, data: Cell): SaleState {
  const s = data.beginParse()
  if (version === 'v4r1') {
    const isComplete = s.loadUint(1) === 1
    const marketplace = addrOrNull(s.loadAddressAny())
    const owner = addrOrNull(s.loadAddressAny())
    const price = s.loadCoins()
    s.loadUint(32) // sold_at
    s.loadUint(64) // sold_query_id
    const st = s.loadRef().beginParse()
    st.loadAddressAny() // fee address
    st.loadAddressAny() // royalty address
    const feePercent = st.loadUint(17)
    const royaltyPercent = st.loadUint(17)
    const nft = st.loadAddress()
    return { version, isComplete, nft, owner, marketplace, price, feePercent, royaltyPercent, jettonPrices: s.loadMaybeRef() }
  }
  // v2, v3, v3r2, v3r3: is_complete:1 created_at:32 marketplace nft owner full_price ^fees …
  const isComplete = s.loadUint(1) === 1
  s.loadUint(32)
  const marketplace = addrOrNull(s.loadAddressAny())
  const nft = s.loadAddress()
  const owner = addrOrNull(s.loadAddressAny())
  const price = s.loadCoins()
  const fees = s.loadRef().beginParse()
  fees.loadAddressAny()
  const marketplaceFee = fees.loadCoins()
  fees.loadAddressAny()
  const royaltyAmount = fees.loadCoins()
  return { version, isComplete, nft, owner, marketplace, price, marketplaceFee, royaltyAmount }
}

/** Versions that also accept the text comment "cancel" (msg::cancel_msg in v3r2, v3r3, v4r1). */
const TEXT_CANCEL: SaleVersion[] = ['v3r2', 'v3r3', 'v4r1']

/**
 * Cancel body. Where the contract accepts it, the text comment "cancel" (wallets show it as plain text);
 * otherwise op 3 + query_id, which every fixed-price version understands.
 */
export function cancelBody(version: SaleVersion, queryId = 0n): Cell {
  return TEXT_CANCEL.includes(version) ? commentBody('cancel') : beginCell().storeUint(OP_CANCEL, 32).storeUint(queryId, 64).endCell()
}

/**
 * Price change. v3r3 stores absolute fees, so they scale with the price (same percentages as listed).
 * v4r1 keeps percentages; its jetton price dictionary is carried over unchanged.
 */
export function repriceBody(state: SaleState, newPrice: bigint, queryId = 0n): Cell {
  if (newPrice <= 0n) throw new Error('Enter a price above 0')
  if (state.version === 'v3r3') {
    if (state.price <= 0n) throw new Error('The current price is 0, so the fee split cannot be scaled')
    const fee = (state.marketplaceFee! * newPrice) / state.price
    const royalty = (state.royaltyAmount! * newPrice) / state.price
    if (newPrice - fee - royalty < 1n) throw new Error('Price too low: nothing left after fees')
    return beginCell().storeUint(OP_CHANGE_PRICE_V3R3, 32).storeUint(queryId, 64).storeCoins(newPrice).storeCoins(fee).storeCoins(royalty).endCell()
  }
  if (state.version === 'v4r1') {
    return beginCell().storeUint(OP_CHANGE_PRICE_V4R1, 32).storeUint(queryId, 64).storeCoins(newPrice).storeMaybeRef(state.jettonPrices ?? null).endCell()
  }
  throw new Error(`Getgems ${state.version} sales cannot change price. Cancel and list again.`)
}

/** Fees the buyer's payment is split into at a given price (for the preview). */
export function feeSplit(state: SaleState, price: bigint): { fee: bigint, royalty: bigint, seller: bigint } {
  let fee: bigint, royalty: bigint
  if (state.version === 'v4r1') {
    fee = (price * BigInt(state.feePercent ?? 0)) / 100_000n
    royalty = (price * BigInt(state.royaltyPercent ?? 0)) / 100_000n
  }
  else {
    fee = state.price > 0n ? (state.marketplaceFee! * price) / state.price : 0n
    royalty = state.price > 0n ? (state.royaltyAmount! * price) / state.price : 0n
  }
  return { fee, royalty, seller: price - fee - royalty }
}

// ---------------------------------------------------------------- listings

export type ListingStatus = 'ready' | 'not-yours' | 'auction' | 'unknown-contract' | 'complete'

export interface Listing {
  nft: TonapiNft
  sale: string
  kind: SaleKind | null
  /** Label for recognised auctions / unknown contracts. */
  contractLabel: string
  state: SaleState | null
  status: ListingStatus
}

/**
 * Combines tonapi's listing with the sale contract's own state (code hash + data from toncenter).
 * Only seller-owned, still-open fixed-price sales of known code are cancellable here.
 */
export function classifyListing(nft: TonapiNft, codeHash: string | undefined, dataBoc: string | undefined, seller: Address): Listing {
  const sale = nft.sale!.address
  const kind = codeHash ? SALE_KINDS[codeHash] ?? null : null
  if (!kind) {
    const auction = codeHash ? AUCTION_KINDS[codeHash] : undefined
    return { nft, sale, kind, state: null, contractLabel: auction ?? 'Unrecognised sale contract', status: auction ? 'auction' : 'unknown-contract' }
  }
  let state: SaleState | null = null
  try {
    state = dataBoc ? parseSaleData(kind.version, Cell.fromBase64(dataBoc)) : null
  }
  catch { /* treated as unknown below */ }
  if (!state) return { nft, sale, kind, state, contractLabel: kind.label, status: 'unknown-contract' }
  const status: ListingStatus = state.isComplete
    ? 'complete'
    : !state.owner?.equals(seller)
        ? 'not-yours'
        : 'ready'
  return { nft, sale, kind, state, contractLabel: kind.label, status }
}

export const canReprice = (l: Listing) => l.status === 'ready' && !!l.kind?.canReprice && (l.state?.price ?? 0n) > 0n

/** One cancel message per listing: to the sale contract (bounceable), with the contract's minimum value. */
export function cancelMessages(listings: Listing[], testnet = false) {
  return listings.map(l => ({
    address: Address.parse(l.sale).toString({ bounceable: true, testOnly: testnet }),
    amount: l.kind!.cancelAmount,
    payload: cancelBody(l.kind!.version)
  }))
}

/** What comes back: everything above the actual fees returns with the NFT (the sale forwards its balance). */
export const cancelTotal = (listings: Listing[]) => listings.reduce((s, l) => s + (l.kind?.cancelAmount ?? 0n), 0n)

/** Marketplace page of a listed NFT. */
export function marketplaceLink(l: Listing, testnet = false): string {
  const a = Address.parse(l.nft.address).toString({ bounceable: true, testOnly: testnet })
  return `https://${testnet ? 'testnet.' : ''}getgems.io/nft/${a}`
}
