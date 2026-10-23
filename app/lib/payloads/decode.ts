// Payload decoder for the "payloads" batch: extends the shared decodeBody (~/utils/ton/messages) with
// wallet requests (W5 signed / extension, highload v3, v3/v4 external bodies), out-action lists and bounces.
// Client-only in practice (needs Buffer). Never throws: problems end up in `error`.
import type { Address, ExternalAddress, Message, MessageRelaxed, OutAction, Slice, StateInit } from '@ton/core'
import { Cell, contractAddress, loadMessage, loadMessageRelaxed, loadOutList } from '@ton/core'
import type { DecodedBody, DecodedValue, DecodeOptions } from '~/utils/ton/messages'
import { decodeBody, parseBoc } from '~/utils/ton/messages'
import { opcodeInfo, opHex } from '~/utils/ton/opcodes'
import { describeMode } from './sendmode'

export type { DecodedBody, DecodedValue, DecodeOptions }

type Fields = Record<string, DecodedValue>

const node = (name: string, title: string, fields: Fields = {}, op: number | null = null): DecodedBody =>
  ({ op, opHex: op === null ? null : opHex(op), name, title, info: op === null ? undefined : opcodeInfo(op), fields })

const fmtAddr = (a: Address | ExternalAddress | null | undefined, o: DecodeOptions): string | null => {
  if (!a) return null
  return 'workChain' in a ? a.toString({ testOnly: o.testOnly }) : a.toString()
}

const b64 = (c: Cell) => c.toBoc().toString('base64')

/** "1792698674 (2026-10-22 12:31:14 UTC)" */
export function fmtUnixTime(t: number): string {
  if (!t) return '0'
  return `${t} (${new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC)`
}

/** Fields shared by MessageRelaxed and Message: who, how much, init, body. */
function messageFields(m: Message | MessageRelaxed, o: DecodeOptions): Fields {
  const f: Fields = {}
  const i = m.info
  if (i.type === 'internal') {
    if (i.src) f.from = fmtAddr(i.src, o)
    f.to = i.dest.toString({ bounceable: i.bounce, testOnly: o.testOnly })
    f.value = i.value.coins
    if (i.value.other?.size) f.extra_currencies = [...i.value.other].map(([id, v]) => `#${id}: ${v}`).join(', ')
    f.bounce = i.bounce
    if (i.bounced) f.bounced = true
  }
  else if (i.type === 'external-in') {
    f.to = fmtAddr(i.dest, o)
  }
  else {
    f.from = fmtAddr(i.src, o)
    f.to = fmtAddr(i.dest, o)
  }
  if (m.init) f.state_init = stateInitNode(m.init, i.type === 'external-out' ? null : (i.dest as Address), o)
  f.body = decodePayload(m.body, o)
  return f
}

function stateInitNode(init: StateInit, dest: Address | null, o: DecodeOptions): DecodedBody {
  const f: Fields = {}
  if (dest) {
    const computed = contractAddress(dest.workChain, init)
    f.deploys_address = computed.toString({ testOnly: o.testOnly })
    f.matches_destination = computed.equals(dest)
  }
  f.code = init.code ? b64(init.code) : null
  f.data = init.data ? b64(init.data) : null
  if (init.code) f.code_hash = init.code.hash().toString('hex')
  return node('state_init', 'StateInit attached (deploys the contract)', f)
}

export function outActionNode(a: OutAction, o: DecodeOptions): DecodedBody {
  switch (a.type) {
    case 'sendMsg':
      return node('action_send_msg', `Send message · mode ${a.mode}`, { mode: describeMode(a.mode), ...messageFields(a.outMsg, o) }, 0x0ec3c86d)
    case 'setCode':
      return node('action_set_code', 'Replace contract code', { new_code: b64(a.newCode), code_hash: a.newCode.hash().toString('hex') }, 0xad4de08e)
    case 'reserve':
      return node('action_reserve_currency', `Reserve balance · mode ${a.mode}`, { mode: a.mode, amount: a.currency.coins }, 0x36e6b809)
    case 'changeLibrary':
      return node('action_change_library', `Change library · mode ${a.mode}`, { mode: a.mode, library: a.libRef.type === 'hash' ? a.libRef.libHash.toString('hex') : b64(a.libRef.library) }, 0x26fa1dd4)
  }
}

function readOutList(cell: Cell, f: Fields, o: DecodeOptions, start = 1) {
  let n = start
  for (const a of loadOutList(cell.beginParse())) f[`action_${n++}`] = outActionNode(a, o)
  return n
}

/** W5 extended actions (wallet-contract-v5 types.tlb). */
function extendedAction(s: Slice, o: DecodeOptions): DecodedBody {
  const tag = s.loadUint(8)
  if (tag === 2) return node('add_extension', 'Add extension', { address: fmtAddr(s.loadAddress(), o) })
  if (tag === 3) return node('remove_extension', 'Remove extension', { address: fmtAddr(s.loadAddress(), o) })
  if (tag === 4) {
    const allowed = s.loadBit()
    return node('set_signature_allowed', allowed ? 'Allow signature auth' : 'Disallow signature auth (extensions only)', { allowed })
  }
  throw new Error(`unknown extended action tag ${tag}`)
}

/** InnerRequest: out_actions:(Maybe ^OutList) has_other_actions:Bool, first extended action inline, the rest chained in refs. */
function readInner(s: Slice, f: Fields, o: DecodeOptions) {
  const out = s.loadMaybeRef()
  let n = out ? readOutList(out, f, o) : 1
  if (s.loadBit()) {
    f[`action_${n++}`] = extendedAction(s, o)
    let ref = s.remainingRefs ? s.loadRef() : null
    while (ref) {
      const rs = ref.beginParse()
      f[`action_${n++}`] = extendedAction(rs, o)
      ref = rs.remainingRefs ? rs.loadRef() : null
    }
  }
  if (n === 1) f.actions = 'none'
}

function readSignedRequest(s: Slice, f: Fields, o: DecodeOptions) {
  f.wallet_id = s.loadUint(32)
  f.valid_until = fmtUnixTime(s.loadUint(32))
  f.seqno = s.loadUint(32)
  readInner(s, f, o)
  f.signature = s.loadBuffer(64).toString('hex')
}

type Reader = (s: Slice, f: Fields, o: DecodeOptions) => void

const EXTRA: Record<number, { name: string, title: string, read: Reader }> = {
  0xffffffff: {
    name: 'bounce',
    title: 'Bounced message',
    read: (s, f) => {
      // The bounced body is 0xffffffff + the first 256 bits of the original body.
      if (s.remainingBits >= 32) {
        const op = s.loadUint(32)
        const info = opcodeInfo(op)
        f.original_op = `${opHex(op)}${info ? ` (${info.title})` : ''}`
        if (s.remainingBits >= 64) f.original_query_id = s.loadUintBig(64)
      }
      else {
        f.original_op = 'none (the bounced message had an empty body)'
      }
    }
  },
  0x7369676e: { name: 'w5_external_signed', title: 'W5 wallet request (signed, external)', read: readSignedRequest },
  0x73696e74: { name: 'w5_internal_signed', title: 'W5 wallet request (signed, internal)', read: readSignedRequest },
  0x6578746e: {
    name: 'w5_extension_action',
    title: 'W5 extension request',
    read: (s, f, o) => {
      f.query_id = s.loadUintBig(64)
      readInner(s, f, o)
    }
  },
  0xae42e5a4: {
    name: 'highload_v3_internal_transfer',
    title: 'Highload v3 batch (internal transfer)',
    read: (s, f, o) => {
      f.query_id = s.loadUintBig(64)
      readOutList(s.loadRef(), f, o)
    }
  }
}

/** loadMessage* leaves an inline body unread (body = rest of the slice), so "fully parsed" means nothing or exactly the body is left. */
const consumed = (s: Slice, body: Cell) =>
  (s.remainingBits === 0 && s.remainingRefs === 0) || (s.remainingBits === body.bits.length && s.remainingRefs === body.refs.length)

/** Parses `cell` fully as a MessageRelaxed or returns null. */
function tryMessageRelaxed(c: Cell): MessageRelaxed | null {
  try {
    const s = c.beginParse()
    const m = loadMessageRelaxed(s)
    return consumed(s, m.body) ? m : null
  }
  catch {
    return null
  }
}

/** Wallet v3 / v4 external body and highload v3 external body have no op code: recognise them by layout. */
function tryWalletBody(cell: Cell, o: DecodeOptions): DecodedBody | null {
  const bits = cell.bits.length
  const refs = cell.refs.length
  try {
    // highload v3: signature:bits512 ^[subwallet_id:uint32 ^message send_mode:uint8 query_id:(13+10) created_at:uint64 timeout:uint22]
    if (bits === 512 && refs === 1 && cell.refs[0]!.bits.length === 149 && cell.refs[0]!.refs.length === 1) {
      const s = cell.beginParse()
      const f: Fields = { signature: s.loadBuffer(64).toString('hex') }
      const r = s.loadRef().beginParse()
      f.subwallet_id = r.loadUint(32)
      const msg = tryMessageRelaxed(r.loadRef())
      if (!msg) return null
      f.mode = describeMode(r.loadUint(8))
      const shift = r.loadUint(13)
      const bit = r.loadUint(10)
      f.query_id = `${shift * 1024 + bit} (shift ${shift}, bit ${bit})`
      f.created_at = fmtUnixTime(Number(r.loadUintBig(64)))
      f.timeout = r.loadUint(22)
      f.message = node('action_send_msg', 'Message to send', messageFields(msg, o))
      return node('highload_v3_external', 'Highload v3 wallet request (signed, external)', f)
    }
    // v3: signature subwallet valid_until seqno (mode ^msg)*  ·  v4: … seqno op:uint8 (mode ^msg)*
    const v3 = bits === 608 + 8 * refs
    const v4 = bits === 616 + 8 * refs
    if (!v3 && !v4) return null
    const msgs = cell.refs.map(tryMessageRelaxed)
    if (msgs.some(m => !m)) return null
    const s = cell.beginParse()
    const f: Fields = { signature: s.loadBuffer(64).toString('hex') }
    f.subwallet_id = s.loadUint(32)
    f.valid_until = fmtUnixTime(s.loadUint(32))
    f.seqno = s.loadUint(32)
    if (v4) {
      const op = s.loadUint(8)
      if (op !== 0) return null // plugin install/remove ops have a different layout
      f.op = '0 (simple send)'
    }
    msgs.forEach((m, i) => {
      const mode = s.loadUint(8)
      f[`action_${i + 1}`] = node('action_send_msg', `Send message · mode ${mode}`, { mode: describeMode(mode), ...messageFields(m!, o) })
    })
    if (!refs) f.actions = 'none'
    return node(v4 ? 'wallet_v4_external' : 'wallet_v3_external', v4 ? 'Wallet v4 request (signed, external)' : 'Wallet v3 request (signed, external)', f)
  }
  catch {
    return null
  }
}

/**
 * Decodes a message body. Known op codes use the shared decoder; wallet requests, out-action lists
 * and bounces are decoded here. Unknown nested bodies carry their BOC in `fields.boc`.
 */
export function decodePayload(body: Cell | string, o: DecodeOptions = {}): DecodedBody {
  let cell: Cell
  try {
    cell = typeof body === 'string' ? parseBoc(body) : body
  }
  catch {
    return decodeBody(body, o) // reports 'invalid'
  }
  const s = cell.beginParse()
  if (s.remainingBits >= 32) {
    const op = s.loadUint(32)
    const extra = EXTRA[op]
    if (extra) {
      const out = node(extra.name, extra.title, {}, op)
      try {
        extra.read(s, out.fields, o)
      }
      catch (e) {
        out.error = `Body does not match ${extra.name}: ${(e as Error).message}`
      }
      return out
    }
  }
  const base = decodeBody(cell, o)
  if (base.name === 'unknown' || base.name === 'raw') {
    const wallet = tryWalletBody(cell, o)
    if (wallet) return wallet
    base.fields.boc = b64(cell)
  }
  // Known op without a field layout here (DEX, staking…): keep the BOC so it can be copied or sent to toncenter.
  else if (!Object.keys(base.fields).length && (cell.bits.length > 32 || cell.refs.length)) {
    base.fields.boc = b64(cell)
  }
  return base
}

export interface DecodedMessage {
  type: 'internal' | 'external-in' | 'external-out'
  title: string
  fields: Fields
  hash: string
}

/** Parses `cell` as a full Message (all bits and refs consumed) or returns null. */
export function decodeMessage(cell: Cell, o: DecodeOptions = {}): DecodedMessage | null {
  let m: Message
  try {
    const s = cell.beginParse()
    m = loadMessage(s)
    if (!consumed(s, m.body)) return null
  }
  catch {
    return null
  }
  const title = { 'internal': 'Internal message', 'external-in': 'External message (signed by a wallet)', 'external-out': 'External out message (event log)' }[m.info.type]
  return { type: m.info.type, title, fields: messageFields(m, o), hash: cell.hash().toString('hex') }
}

export type Analysis =
  | { kind: 'empty' }
  | { kind: 'hash', hash: string }
  | { kind: 'body', body: DecodedBody, hash: string }
  | { kind: 'message', message: DecodedMessage }

/** Tx hash (64 hex or 44 base64) or a BOC. A known op wins; otherwise a full message is tried before an unknown body. */
export function analyzeInput(input: string, o: DecodeOptions = {}): Analysis {
  const v = input.trim().replace(/\s+/g, '')
  if (!v) return { kind: 'empty' }
  if (/^[0-9a-f]{64}$/i.test(v)) return { kind: 'hash', hash: v.toLowerCase() }
  if (/^[\w+/-]{43}=?$/.test(v) && !v.startsWith('te6cc')) return { kind: 'hash', hash: Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex') }
  const cell = parseBoc(v) // throws a friendly error
  const body = decodePayload(cell, o)
  if (body.name === 'unknown' || body.name === 'raw' || body.error) {
    const message = decodeMessage(cell, o)
    if (message) return { kind: 'message', message }
  }
  return { kind: 'body', body, hash: cell.hash().toString('hex') }
}

/** Flattens a decoded tree for search/tests: "action_1.body.amount" -> value. */
export function flatten(body: DecodedBody, prefix = ''): Record<string, string> {
  const out: Record<string, string> = { [`${prefix}name`]: body.name }
  for (const [k, v] of Object.entries(body.fields)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`))
    else out[prefix + k] = v === null ? 'null' : String(v)
  }
  return out
}

/** Compact JSON-friendly form: { type, op?, error?, ...fields } (bigints stay bigint; JsonView handles them). */
export function plain(body: DecodedBody): Record<string, unknown> {
  const out: Record<string, unknown> = { type: body.name }
  if (body.opHex) out.op = body.opHex
  if (body.error) out.error = body.error
  for (const [k, v] of Object.entries(body.fields)) out[k] = v && typeof v === 'object' ? plain(v) : v
  return out
}
