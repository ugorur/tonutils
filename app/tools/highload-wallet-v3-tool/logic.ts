// Highload wallet v3: address from (public key, subwallet id, timeout), query id math, state summary.
// Contract: github.com/ton-blockchain/highload-wallet-contract-v3 (build/HighloadWalletV3.compiled.json).
import type { OutActionSendMsg, StateInit } from '@ton/core'
import { Address, beginCell, Cell, contractAddress, external, internal, SendMode, storeMessage, storeMessageRelaxed, storeOutList } from '@ton/core'
import type { HighloadV3State } from '~/lib/wallet-detection/state'
import { usedQueryIds } from '~/lib/wallet-detection/state'

export const HIGHLOAD_V3_CODE = Cell.fromHex('b5ee9c7241021001000228000114ff00f4a413f4bcf2c80b01020120020d02014803040078d020d74bc00101c060b0915be101d0d3030171b0915be0fa4030f828c705b39130e0d31f018210ae42e5a4ba9d8040d721d74cf82a01ed55fb04e030020120050a02027306070011adce76a2686b85ffc00201200809001aabb6ed44d0810122d721d70b3f0018aa3bed44d08307d721d70b1f0201200b0c001bb9a6eed44d0810162d721d70b15800e5b8bf2eda2edfb21ab09028409b0ed44d0810120d721f404f404d33fd315d1058e1bf82325a15210b99f326df82305aa0015a112b992306dde923033e2923033e25230800df40f6fa19ed021d721d70a00955f037fdb31e09130e259800df40f6fa19cd001d721d70a00937fdb31e0915be270801f6f2d48308d718d121f900ed44d0d3ffd31ff404f404d33fd315d1f82321a15220b98e12336df82324aa00a112b9926d32de58f82301de541675f910f2a106d0d31fd4d307d30cd309d33fd315d15168baf2a2515abaf2a6f8232aa15250bcf2a304f823bbf2a35304800df40f6fa199d024d721d70a00f2649130e20e01fe5309800df40f6fa18e13d05004d718d20001f264c858cf16cf8301cf168e1030c824cf40cf8384095005a1a514cf40e2f800c94039800df41704c8cbff13cb1ff40012f40012cb3f12cb15c9ed54f80f21d0d30001f265d3020171b0925f03e0fa4001d70b01c000f2a5fa4031fa0031f401fa0031fa00318060d721d300010f0020f265d2000193d431d19130e272b1fb00b585bf03')

export const MAX_SHIFT = 8191
/** Bit 1023 does not fit the 1023-bit bitmap cell, so 1022 is the last usable bit number. */
export const MAX_BIT_NUMBER = 1022
export const MAX_QUERY_ID = (MAX_SHIFT << 10) + MAX_BIT_NUMBER
/** timeout is uint22 seconds (~48.5 days). */
export const MAX_TIMEOUT = 2 ** 22 - 1

export function parsePublicKey(input: string): Buffer {
  const s = input.trim().replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex')
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (s.length >= 43 && b.length === 32) return b
  throw new Error('A public key is 32 bytes: 64 hex characters or 44 base64 characters.')
}

function uint(input: string | number, max: number, what: string, min = 0): number {
  const s = String(input).trim()
  const n = /^0x[0-9a-f]+$/i.test(s) ? Number.parseInt(s, 16) : /^\d+$/.test(s) ? Number(s) : Number.NaN
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${what} must be a whole number from ${min} to ${max}`)
  return n
}

export interface HighloadV3Config { publicKey: string, subwalletId: string | number, timeout: string | number, workchain?: number }

/** Same init data as the official wrapper: key, subwallet, two empty dicts, last_clean_time 0, timeout. */
export function highloadV3Init(c: HighloadV3Config) {
  const data = beginCell()
    .storeBuffer(parsePublicKey(c.publicKey))
    .storeUint(uint(c.subwalletId, 2 ** 32 - 1, 'Subwallet id'), 32)
    .storeUint(0, 1 + 1 + 64)
    // timeout 0 deploys a wallet that rejects every message (created_at must be in (now - timeout, now]).
    .storeUint(uint(c.timeout, MAX_TIMEOUT, 'Timeout', 1), 22)
    .endCell()
  return { code: HIGHLOAD_V3_CODE, data }
}

export function highloadV3Address(c: HighloadV3Config): Address {
  return contractAddress(c.workchain ?? 0, highloadV3Init(c))
}

export interface QueryId {
  queryId: number
  shift: number
  bitNumber: number
  /** Sequential index used by HighloadQueryId.toSeqno(): shift * 1023 + bit. */
  seqno: number
}

export function fromShiftAndBit(shift: string | number, bit: string | number): QueryId {
  const sh = uint(shift, MAX_SHIFT, 'Shift')
  const bn = uint(bit, MAX_BIT_NUMBER, 'Bit number')
  return { queryId: (sh << 10) + bn, shift: sh, bitNumber: bn, seqno: sh * 1023 + bn }
}

export function fromQueryId(q: string | number): QueryId {
  const n = uint(q, 2 ** 23 - 1, 'Query id')
  if ((n & 1023) > MAX_BIT_NUMBER) throw new Error('Bit number 1023 is never valid: the contract rejects it')
  return fromShiftAndBit(n >> 10, n & 1023)
}

export function fromSeqno(i: string | number): QueryId {
  const n = uint(i, MAX_SHIFT * 1023 + MAX_BIT_NUMBER, 'Sequence number')
  return fromShiftAndBit(Math.floor(n / 1023), n % 1023)
}

/** The next id in HighloadQueryId.getNext() order, or null when the space is exhausted. */
export function nextQueryId(q: QueryId): QueryId | null {
  // The wrapper keeps the very last id free for an emergency withdrawal.
  if (q.shift === MAX_SHIFT && q.bitNumber + 1 > MAX_BIT_NUMBER - 1) return null
  return q.bitNumber + 1 > MAX_BIT_NUMBER ? fromShiftAndBit(q.shift + 1, 0) : fromShiftAndBit(q.shift, q.bitNumber + 1)
}

export function summarize(st: HighloadV3State) {
  const current = usedQueryIds(st.queries)
  const previous = usedQueryIds(st.oldQueries)
  const all = [...previous, ...current]
  return {
    current: current.length,
    previous: previous.length,
    /** Highest id seen in either window (ids need not be used in order). */
    highest: all.reduce<number | null>((m, q) => (m === null || q > m ? q : m), null)
  }
}

// ---------------------------------------------------------------- batch (unsigned)
// Same layout as the official wrapper (HighloadWalletV3.ts: packActions / createInternalTransferBody /
// sendExternalMessage): the external carries one message to the wallet itself, an internal_transfer whose
// out-action list holds up to 254 transfers; longer batches chain 253 transfers + a link to the next batch.

export const OP_INTERNAL_TRANSFER = 0xae42e5a4
export const MAX_ACTIONS = 254
// ponytail: cap of 10 chained hops so a pasted file cannot build a giant BOC; raise if someone needs more.
export const MAX_BATCH = 253 * 9 + 254

export interface BatchTransfer {
  to: Address
  amount: bigint
  bounce: boolean
  body?: Cell
}

export interface MsgInnerParams {
  subwalletId: number
  queryId: number
  createdAt: number
  timeout: number
}

function sendMsg(m: Parameters<typeof internal>[0], mode: number): OutActionSendMsg {
  return { type: 'sendMsg', mode, outMsg: internal(m) }
}

/** The internal_transfer message the wallet sends to itself (MessageRelaxed), chained past 254 transfers. */
export function packTransfers(wallet: Address, transfers: BatchTransfer[], queryId: number): Cell {
  if (!transfers.length) throw new Error('Add at least one transfer')
  if (transfers.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} transfers per external message`)
  const pack = (list: BatchTransfer[]): ReturnType<typeof internal> => {
    const actions: OutActionSendMsg[] = list.slice(0, list.length > MAX_ACTIONS ? 253 : MAX_ACTIONS)
      .map(t => sendMsg({ to: t.to, value: t.amount, bounce: t.bounce, body: t.body }, SendMode.PAY_GAS_SEPARATELY))
    if (list.length > MAX_ACTIONS) actions.push({ type: 'sendMsg', mode: SendMode.CARRY_ALL_REMAINING_BALANCE, outMsg: pack(list.slice(253)) })
    const body = beginCell().storeUint(OP_INTERNAL_TRANSFER, 32).storeUint(queryId, 64).storeRef(beginCell().store(storeOutList(actions)).endCell()).endCell()
    return internal({ to: wallet, value: 0n, body })
  }
  return beginCell().store(storeMessageRelaxed(pack(transfers))).endCell()
}

/** msg_inner: subwallet_id:uint32 message_to_send:^Cell send_mode:uint8 query_id:uint23 created_at:uint64 timeout:uint22. Sign its hash. */
export function buildMsgInner(message: Cell, p: MsgInnerParams, mode = SendMode.CARRY_ALL_REMAINING_BALANCE): Cell {
  return beginCell()
    .storeUint(uint(p.subwalletId, 2 ** 32 - 1, 'Subwallet id'), 32)
    .storeRef(message)
    .storeUint(mode, 8)
    .storeUint(fromQueryId(p.queryId).queryId, 23)
    .storeUint(uint(p.createdAt, 2 ** 40, 'created_at'), 64)
    .storeUint(uint(p.timeout, MAX_TIMEOUT, 'Timeout', 1), 22)
    .endCell()
}

export function parseSignature(input: string): Buffer {
  const s = input.trim().replace(/^0x/i, '')
  if (/^[0-9a-f]{128}$/i.test(s)) return Buffer.from(s, 'hex')
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (b.length === 64) return b
  throw new Error('An Ed25519 signature is 64 bytes: 128 hex characters or 88 base64 characters.')
}

/** The external message to broadcast (sendBoc): signature:bits512 msg_inner:^MsgInner, with StateInit for a first deploy. */
export function signedExternal(wallet: Address, inner: Cell, signature: Buffer, init?: StateInit): Cell {
  const body = beginCell().storeBuffer(signature, 64).storeRef(inner).endCell()
  return beginCell().store(storeMessage(external({ to: wallet, body, init }))).endCell()
}

/** "address, amount[, comment]" per line. Amounts in coins (9 decimals). */
export function parseBatch(text: string, parseAmount: (s: string) => bigint): { transfers: BatchTransfer[], errors: string[] } {
  const transfers: BatchTransfer[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return
    const [addr = '', amount = '', ...rest] = line.split(',').map(x => x.trim())
    try {
      const friendly = Address.isFriendly(addr) ? Address.parseFriendly(addr) : null
      const to = friendly ? friendly.address : Address.parseRaw(addr)
      const nano = parseAmount(amount)
      if (nano <= 0n) throw new Error('amount must be above 0')
      const comment = rest.join(',').trim()
      transfers.push({ to, amount: nano, bounce: friendly ? friendly.isBounceable : true, body: comment ? beginCell().storeUint(0, 32).storeStringTail(comment).endCell() : undefined })
    }
    catch (e) {
      errors.push(`Line ${i + 1}: ${(e as Error).message}`)
    }
  })
  return { transfers, errors }
}
