// Spam NFT cleaner: classify an account's NFTs, emulate a transfer of each to the zero (burn) address,
// and build the TEP-62 transfer messages only for those that really move.
import { Address, beginCell, Cell, loadShardAccount, loadTransaction, storeMessage, storeShardAccount } from '@ton/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import { COIN_SYMBOL } from '~/utils/currency'
import { nftTransferBody } from '~/utils/ton/messages'

/** 0:000…000 — no key exists for it, so whatever lands there is gone for good (UQAAAA…JKZ). */
export const BURN_ADDRESS = Address.parse(`0:${'0'.repeat(64)}`)
/** nanoGRAM attached to each transfer. A standard item keeps nothing and returns the excess to you. */
export const TRANSFER_AMOUNT = 50_000_000n
/** Fees a well-behaved transfer costs (gas + forwarding, ~0.006 today); more than this kept = the contract takes your GRAM. */
export const NORMAL_COST = 15_000_000n
/**
 * Storage reserve a standard item tops itself up to on transfer (min_tons_for_storage in getgems nft-item.fc).
 * An item holding less keeps the difference from the attached value: normal behaviour, not a trap.
 */
export const ITEM_STORAGE_RESERVE = 50_000_000n

export type SpamClass = 'scam' | 'suspicious' | 'unverified' | 'trusted'

/** Alone enough to call an unverified NFT spam: fake vouchers, "claim" bait, bot links, coin amounts in the title. */
const STRONG = [
  /voucher/i, /\bclaim(?:s|ed|ing)?\b/i, /\bredeem/i, /airdrop/i, /giveaway/i, /@\w+bot\b/i, /t\.me\/\w+bot\b/i,
  /(?:^|[^\w#])\d[\d,.]*(?: ?[km])? ?\$?(ton|gram|usdt|usd₮|not|dogs|ham|ston|tston|hmstr)\b/i,
  // Latin and Cyrillic letters mixed inside one word ("Rеdееm vоuchеr"): a filter-dodging trick legit projects do not use.
  /(?:^|[^a-z\u0400-\u04ff])(?=[a-z\u0400-\u04ff]*[a-z])(?=[a-z\u0400-\u04ff]*[\u0400-\u04ff])[a-z\u0400-\u04ff]{3,}/i
]
/** Common in legit NFTs too (event rewards, project sites): only spam when two of them appear together. */
const WEAK = [
  /\breward/i, /\bbonus/i, /\bgift\b/i, /\bfree\b/i, /\bwinner/i, /\bprize/i, /\blucky\b/i, /t\.me\//i, /https?:\/\//i,
  /\b[\w-]+\.(com|io|org|xyz|app|site|online|pro|net|top|fun|cc|life)\b/i, /\$[a-z]{2,}/i
]

export interface Classified {
  cls: SpamClass
  reasons: string[]
}

/** tonapi's trust flag first, then text heuristics on the name/description of unverified items. */
export function classifyNft(nft: TonapiNft): Classified {
  if (nft.trust === 'blacklist') return { cls: 'scam', reasons: ['Flagged as a scam by tonapi (the Tonkeeper spam list)'] }
  if (nft.trust === 'whitelist' || (nft.approved_by?.length ?? 0) > 0 || nft.dns) return { cls: 'trusted', reasons: [nft.dns ? 'TON DNS domain' : `Verified${nft.approved_by?.length ? ` by ${nft.approved_by.join(', ')}` : ''}`] }
  const text = [nft.metadata?.name, nft.metadata?.description, nft.collection?.name].filter(Boolean).join(' \n ')
  if (STRONG.some(r => r.test(text)) || WEAK.filter(r => r.test(text)).length >= 2) return { cls: 'suspicious', reasons: ['Name or description looks like a fake voucher, airdrop or link bait'] }
  return { cls: 'unverified', reasons: [nft.trust === 'graylist' ? 'Graylisted by tonapi' : 'Not verified'] }
}

/** TEP-62 transfer to the burn address; excess comes back to you. Sent bounceable so a failing contract refunds. */
export function burnMessage(nft: string, wallet: Address, testnet = false) {
  return {
    address: Address.parse(nft).toString({ bounceable: true, testOnly: testnet }),
    amount: TRANSFER_AMOUNT,
    payload: nftTransferBody({ newOwner: BURN_ADDRESS, responseDestination: wallet, forwardAmount: 0n })
  }
}

// ---------------------------------------------------------------- emulation inputs / outputs (base64 BOCs for the sandbox worker)

export function shardAccountBoc(address: Address, code: Cell, data: Cell, balance: bigint, now: number): string {
  const cell = beginCell().store(storeShardAccount({
    account: {
      addr: address,
      storageStats: { used: { cells: 0n, bits: 0n }, lastPaid: now, duePayment: null, storageExtra: null },
      storage: { lastTransLt: 0n, balance: { coins: balance }, state: { type: 'active', state: { code, data } } }
    },
    lastTransactionLt: 0n,
    lastTransactionHash: 0n
  })).endCell()
  return cell.toBoc().toString('base64')
}

/** The internal message the wallet would deliver to the NFT (wallet fees are not part of it). */
export function burnInternalBoc(nft: Address, wallet: Address, lt: bigint, now: number): string {
  const msg = burnMessage(nft.toString(), wallet)
  return beginCell().store(storeMessage({
    info: {
      type: 'internal', ihrDisabled: true, bounce: true, bounced: false, src: wallet, dest: nft,
      value: { coins: msg.amount }, ihrFee: 0n, forwardFee: 0n, createdLt: lt, createdAt: now
    },
    body: msg.payload
  })).endCell().toBoc().toString('base64')
}

export type BurnVerdict =
  | { ok: true, cost: bigint }
  | { ok: false, why: 'refuses' | 'keeps-funds' | 'not-moved' | 'error', cost: bigint | null, detail: string }

export interface EmulatedTransfer {
  success: boolean
  aborted: boolean
  exitCode: number | null
  /** nanoGRAM that comes back to the wallet in this transaction's outgoing messages. */
  refund: bigint
  /** nanoGRAM the contract sends anywhere else (a well-behaved burn sends nothing to third parties). */
  leaked: bigint
  /** New account state (code/data) when the transaction ran. */
  code: Cell | null
  data: Cell | null
}

/** Reads the executor result (transaction + new shard account, both base64). */
export function readEmulation(txB64: string, shardAccountB64: string, wallet: Address): EmulatedTransfer {
  const tx = loadTransaction(Cell.fromBase64(txB64).beginParse())
  const d = tx.description
  let exitCode: number | null = null
  let success = false
  let aborted = true
  if (d.type === 'generic') {
    aborted = d.aborted
    if (d.computePhase.type === 'vm') {
      exitCode = d.computePhase.exitCode
      success = d.computePhase.success
    }
  }
  let refund = 0n
  let leaked = 0n
  for (const m of tx.outMessages.values()) {
    if (m.info.type !== 'internal') continue
    if (m.info.dest.equals(wallet)) refund += m.info.value.coins
    else leaked += m.info.value.coins
  }
  const sa = loadShardAccount(Cell.fromBase64(shardAccountB64).beginParse())
  const st = sa.account?.storage.state
  const active = st?.type === 'active' ? st.state : null
  return { success, aborted, exitCode, refund, leaked, code: active?.code ?? null, data: active?.data ?? null }
}

/** Decides from the emulated transfer, the owner the item reports afterwards and its balance before the transfer. */
export function judgeBurn(e: EmulatedTransfer, ownerAfter: Address | null, balanceBefore = ITEM_STORAGE_RESERVE): BurnVerdict {
  const cost = TRANSFER_AMOUNT - e.refund
  if (!e.success || e.aborted) return { ok: false, why: 'refuses', cost, detail: `The contract rejects transfers (exit code ${e.exitCode ?? 'n/a'}). Your ${COIN_SYMBOL} would bounce back minus fees, but the NFT stays.` }
  if (!ownerAfter?.equals(BURN_ADDRESS)) {
    return cost > NORMAL_COST
      ? { ok: false, why: 'keeps-funds', cost, detail: `The contract pretends to accept the transfer but keeps the ${COIN_SYMBOL} you attach, and the NFT does not move. A trap: hide it instead.` }
      : { ok: false, why: 'not-moved', cost, detail: 'The transfer runs but the NFT does not change owner.' }
  }
  const topUp = balanceBefore < ITEM_STORAGE_RESERVE ? ITEM_STORAGE_RESERVE - balanceBefore : 0n
  // Value that stays in the item tops up its storage reserve; value sent to someone else is taken from you.
  if (e.leaked > NORMAL_COST || cost > NORMAL_COST + topUp) return { ok: false, why: 'keeps-funds', cost, detail: `It moves, but the contract keeps most of the ${COIN_SYMBOL} you attach.` }
  return { ok: true, cost }
}


/** The two sandbox calls checkBurn needs (shape of loadSandbox() from ~/utils/lazy). */
export interface Emulator {
  runTransaction(a: { shardAccount: string, message: string, now: number, lt: string }): Promise<{ result: { success: true, transaction: string, shardAccount: string } | { success: false, error: string } }>
  runGetMethod(a: { code: Cell, data: Cell, address: Address, method: string, balance?: bigint }): Promise<{ exitCode: number, reader: { skip(n?: number): unknown, readAddressOpt(): Address | null } }>
}

export interface NftState { address: string, code: string, data: string, balance: string }

/** Emulates "transfer to the burn address" against the item's real code and data, then asks it who owns it now. */
export async function checkBurn(emu: Emulator, nft: NftState, wallet: Address, now = Math.floor(Date.now() / 1000)): Promise<BurnVerdict> {
  const address = Address.parse(nft.address)
  const lt = 1_000_000n
  try {
    const r = await emu.runTransaction({
      shardAccount: shardAccountBoc(address, Cell.fromBase64(nft.code), Cell.fromBase64(nft.data), BigInt(nft.balance), now),
      message: burnInternalBoc(address, wallet, lt, now),
      now,
      lt: (lt + 1n).toString()
    })
    if (!r.result.success) return { ok: false, why: 'error', cost: null, detail: `Could not emulate this contract (${r.result.error.slice(0, 120)}). Treat it as unsafe.` }
    const e = readEmulation(r.result.transaction, r.result.shardAccount, wallet)
    let owner: Address | null = null
    if (e.code && e.data) {
      const g = await emu.runGetMethod({ code: e.code, data: e.data, address, method: 'get_nft_data' })
      if (g.exitCode === 0 || g.exitCode === 1) {
        g.reader.skip(3)
        owner = g.reader.readAddressOpt()
      }
    }
    return judgeBurn(e, owner, BigInt(nft.balance))
  }
  catch (err) {
    return { ok: false, why: 'error', cost: null, detail: `Could not emulate this contract (${(err as Error).message.slice(0, 120)}). Treat it as unsafe.` }
  }
}
