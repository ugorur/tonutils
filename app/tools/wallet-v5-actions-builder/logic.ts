// W5 (wallet v5r1) request builder. TL-B from ton-blockchain/wallet-contract-v5 types.tlb:
//   signed_request$_ wallet_id:uint32 valid_until:uint32 msg_seqno:uint32 inner:InnerRequest signature:bits512
//   internal_signed#73696e74 / external_signed#7369676e signed:SignedRequest
//   extension_action#6578746e query_id:uint64 inner:InnerRequest
//   actions$_ out_actions:(Maybe ^OutList) has_other_actions:(## 1) … (first extended action inline, the rest chained in refs)
// The signature is ed25519 over the hash of the cell holding everything before it (op included).
import type { Address, Builder, OutActionSendMsg, StateInit } from '@ton/core'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { MessageSpec } from '~/lib/payloads/message'
import { beginCell, Cell, SendMode, storeMessage, storeOutList } from '@ton/core'
import { messageRelaxed } from '~/lib/payloads/message'
import { NETWORK_GLOBAL_ID } from '~/utils/ton/wallets'

export const W5_OPS = { external: 0x7369676e, internal: 0x73696e74, extension: 0x6578746e } as const
export type W5Auth = keyof typeof W5_OPS
export const MAX_ACTIONS = 255

export type W5Action
  = | { type: 'send', mode: number, message: MessageSpec }
    | { type: 'add_extension', address: Address }
    | { type: 'remove_extension', address: Address }
    | { type: 'set_signature_allowed', allowed: boolean }

/**
 * Default wallet_id of a v5r1 wallet: network_global_id XOR client context
 * (1 bit flag | workchain int8 | version uint8 = 0 | subwallet uint15). Returned as uint32.
 */
export function walletIdV5R1(network: TonNetwork | number, workchain = 0, subwallet = 0): number {
  const globalId = typeof network === 'number' ? network : NETWORK_GLOBAL_ID[network]
  const context = beginCell().storeUint(1, 1).storeInt(workchain, 8).storeUint(0, 8).storeUint(subwallet, 15).endCell().beginParse().loadInt(32)
  return ((globalId ^ context) >>> 0)
}

/** External requests must carry +2 (IGNORE_ERRORS) or the wallet rejects them (exit code 137). */
export const safeMode = (mode: number, auth: W5Auth) => (auth === 'external' ? mode | SendMode.IGNORE_ERRORS : mode)

function storeExtended(b: Builder, a: Exclude<W5Action, { type: 'send' }>) {
  if (a.type === 'add_extension') return b.storeUint(2, 8).storeAddress(a.address)
  if (a.type === 'remove_extension') return b.storeUint(3, 8).storeAddress(a.address)
  return b.storeUint(4, 8).storeBit(a.allowed)
}

/** InnerRequest. Send actions keep their order (OutList stores them reversed internally). */
export function storeInner(actions: W5Action[], auth: W5Auth) {
  return (b: Builder) => {
    const sends: OutActionSendMsg[] = actions.flatMap(a => (a.type === 'send' ? [{ type: 'sendMsg' as const, mode: safeMode(a.mode, auth), outMsg: messageRelaxed(a.message) }] : []))
    const ext = actions.filter((a): a is Exclude<W5Action, { type: 'send' }> => a.type !== 'send')
    b.storeMaybeRef(sends.length ? beginCell().store(storeOutList(sends)).endCell() : null)
    if (!ext.length) return b.storeBit(0)
    b.storeBit(1)
    storeExtended(b, ext[0]!)
    // the rest: each cell holds one action and a ref to the next
    let tail: Cell | null = null
    for (const a of ext.slice(1).reverse()) {
      const c = beginCell()
      storeExtended(c, a)
      if (tail) c.storeRef(tail)
      tail = c.endCell()
    }
    if (tail) b.storeRef(tail)
    return b
  }
}

export interface W5RequestParams {
  auth: W5Auth
  walletId: number
  /** unix seconds */
  validUntil: number
  seqno: number
  /** extension auth only */
  queryId?: bigint
  actions: W5Action[]
}

export interface W5Request {
  /** extension: the complete body. signed: everything except the signature. */
  unsigned: Cell
  /** hex hash an ed25519 key must sign (signed auth only). */
  signingHash: string | null
}

export function buildRequest(p: W5RequestParams): W5Request {
  if (!p.actions.length) throw new Error('Add at least one action')
  if (p.actions.length > MAX_ACTIONS) throw new Error(`A W5 request holds at most ${MAX_ACTIONS} actions`)
  const b = beginCell().storeUint(W5_OPS[p.auth], 32)
  if (p.auth === 'extension') {
    const body = b.storeUint(p.queryId ?? 0n, 64).store(storeInner(p.actions, p.auth)).endCell()
    return { unsigned: body, signingHash: null }
  }
  const unsigned = b.storeUint(p.walletId, 32).storeUint(p.validUntil, 32).storeUint(p.seqno, 32).store(storeInner(p.actions, p.auth)).endCell()
  return { unsigned, signingHash: unsigned.hash().toString('hex') }
}

/** Appends a 64-byte signature (hex) to the unsigned request. */
export function attachSignature(unsigned: Cell, signatureHex: string): Cell {
  const hex = signatureHex.trim().replace(/^0x/i, '')
  if (!/^[0-9a-f]{128}$/i.test(hex)) throw new Error('The signature must be 64 bytes (128 hex characters)')
  return beginCell().storeSlice(unsigned.beginParse()).storeBuffer(Buffer.from(hex, 'hex')).endCell()
}

/** External-in message to the wallet, ready for sendBoc. Attach the StateInit when seqno is 0 and the wallet is not deployed. */
export function externalMessage(wallet: Address, body: Cell, init?: StateInit | null): Cell {
  return beginCell().store(storeMessage({ info: { type: 'external-in', dest: wallet, importFee: 0n }, init: init ?? undefined, body })).endCell()
}
