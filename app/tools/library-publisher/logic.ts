// Publish a cell as a public masterchain library with the official librarian (ton-blockchain/multisig-contract-v2
// contracts/helper/librarian.func, also used by the stablecoin / Jetton 2.0 deploys). The librarian lives on workchain -1,
// its data is the library cell. On its first message it reserves compute fee + 10 years of masterchain storage for the
// cell, returns the rest to the sender, calls SETLIBCODE mode 2 (public) and empties its own code and data.
import type { Address, Cell, StateInit } from '@ton/core'
import { beginCell, contractAddress, storeStateInit } from '@ton/core'
import { codes, LIBRARIAN_DURATION } from '~/lib/deployers/codes'
import { libraryRefCell } from '~/tools/stateinit-builder/logic'
import { cellStats, storageFee, type StoragePrices } from '~/tools/unfreeze-account/logic'

/** librarian.func: "according network config, max cells in library = 1000". */
export const MAX_LIBRARY_CELLS = 1000n
/**
 * Sent on top of the storage reserve; the librarian returns whatever it does not use. Covers masterchain gas
 * (~5,700 gas at 10,000 nano/gas on mainnet) and the return message.
 */
export const FEE_BUFFER = 200_000_000n

export interface LibraryPlan {
  library: Cell
  /** Library hash (hex) = the hash contracts reference. */
  hash: string
  cells: bigint
  bits: bigint
  init: StateInit
  stateInit: Cell
  /** The librarian account, workchain -1. Same library = same address. */
  address: Address
  /** Exotic library cell (type 2) to use as code (or any cell) instead of the full cell. */
  ref: Cell
}

export function planLibrary(library: Cell): LibraryPlan {
  if (library.isExotic) throw new Error('This is already an exotic cell (a library reference or a proof). Publish the ordinary cell it stands for.')
  const { cells, bits } = cellStats(library)
  if (cells > MAX_LIBRARY_CELLS) throw new Error(`The cell tree has ${cells} cells; the librarian accepts at most ${MAX_LIBRARY_CELLS}.`)
  const init = { code: codes().librarian, data: library }
  const hash = library.hash().toString('hex')
  return {
    library,
    hash,
    cells,
    bits,
    init,
    stateInit: beginCell().store(storeStateInit(init)).endCell(),
    address: contractAddress(-1, init),
    ref: libraryRefCell(hash)
  }
}

export interface PublishCost {
  /** What the librarian keeps: 10 years of masterchain storage for the cell (librarian.func DEFAULT_DURATION). */
  storage: bigint
  /** Storage per year, for top-ups. */
  perYear: bigint
  /** Value of the deploy message: storage + FEE_BUFFER. The unused part comes back. */
  amount: bigint
}

export function publishCost(prices: StoragePrices, plan: Pick<LibraryPlan, 'cells' | 'bits'>): PublishCost {
  const storage = storageFee(prices, LIBRARIAN_DURATION, true, plan.cells, plan.bits)
  return { storage, perYear: storageFee(prices, 365 * 86400, true, plan.cells, plan.bits), amount: storage + FEE_BUFFER }
}

/** Bounceable masterchain address: if the reserve fails the message bounces and the GRAM comes back. */
export function publishMessage(plan: LibraryPlan, amount: bigint, testnet: boolean) {
  return { address: plan.address.toString({ bounceable: true, testOnly: testnet }), amount, stateInit: plan.stateInit }
}

/** toncenter v2 getLibraries result entry: hash is base64. */
export interface LibraryEntry { hash: string, data: string }

export function isPublished(entries: LibraryEntry[], hash: string): boolean {
  return entries.some(e => e.data && Buffer.from(e.hash, 'base64').toString('hex') === hash.toLowerCase())
}
