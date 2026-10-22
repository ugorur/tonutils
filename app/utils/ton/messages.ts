// Message body builders (TL-B exact) and a universal body decoder. Client-only in practice (needs Buffer),
// pure TypeScript: import from Tool.vue / logic.ts, never from pages or shared layout.
import type { Builder, Slice } from '@ton/core'
import { Address, beginCell, Cell, comment, loadMessage, storeMessage } from '@ton/core'
import { OP, opcodeInfo, opHex, type OpcodeInfo } from './opcodes'

// ---------------------------------------------------------------- parsing helpers

/** Parses a BOC given as base64, base64url or hex. Throws Error('Not a valid BOC …'). */
export function parseBoc(input: string): Cell {
  const s = input.trim().replace(/\s+/g, '')
  if (!s) throw new Error('Paste a BOC (base64 or hex)')
  try {
    const bytes = /^(0x)?[0-9a-f]+$/i.test(s) && s.length % 2 === 0
      ? Buffer.from(s.replace(/^0x/i, ''), 'hex')
      : Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    return Cell.fromBoc(bytes)[0]!
  }
  catch {
    throw new Error('Not a valid BOC. Paste base64 (te6cc…) or hex (b5ee9c72…).')
  }
}

// ---------------------------------------------------------------- builders

/** text_comment#00000000 text:SnakeData. Same as @ton/core comment(). */
export function commentBody(text: string): Cell {
  return comment(text)
}

/** Either Cell ^Cell: empty -> bit 0; payload -> bit 1 + ref (what Tonkeeper and @ton/ton send). */
function storeForwardPayload(b: Builder, payload: Cell | string | null | undefined) {
  if (payload === null || payload === undefined || payload === '') return b.storeBit(0)
  return b.storeBit(1).storeRef(typeof payload === 'string' ? commentBody(payload) : payload)
}

export interface JettonTransferParams {
  queryId?: bigint
  /** Jetton base units (respect decimals: see jetton.ts parseJettonAmount). */
  amount: bigint
  /** Recipient owner address (NOT their jetton wallet). */
  destination: Address
  /** Where excess gas goes, usually the sender. */
  responseDestination: Address | null
  customPayload?: Cell | null
  /** nanoGRAM forwarded to the recipient with the notification. 1n is enough to trigger it; 0n skips it. */
  forwardTonAmount?: bigint
  /** A Cell, or a string sent as a text comment. */
  forwardPayload?: Cell | string | null
}

/** TEP-74 transfer#0f8a7ea5. Send to YOUR jetton wallet, with ~0.05 GRAM attached. */
export function jettonTransferBody(p: JettonTransferParams): Cell {
  const b = beginCell()
    .storeUint(OP('jetton_transfer'), 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(p.destination)
    .storeAddress(p.responseDestination)
    .storeMaybeRef(p.customPayload ?? null)
    .storeCoins(p.forwardTonAmount ?? 0n)
  return storeForwardPayload(b, p.forwardPayload).endCell()
}

/** TEP-74 burn#595f07bc. Send to YOUR jetton wallet. */
export function jettonBurnBody(p: { queryId?: bigint, amount: bigint, responseDestination: Address | null, customPayload?: Cell | null }): Cell {
  return beginCell()
    .storeUint(OP('jetton_burn'), 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeCoins(p.amount)
    .storeAddress(p.responseDestination)
    .storeMaybeRef(p.customPayload ?? null)
    .endCell()
}

export interface NftTransferParams {
  queryId?: bigint
  newOwner: Address
  responseDestination: Address | null
  customPayload?: Cell | null
  /** nanoGRAM forwarded to the new owner with ownership_assigned (0n = no notification). */
  forwardAmount?: bigint
  forwardPayload?: Cell | string | null
}

/** TEP-62 transfer#5fcc3d14. Send to the NFT item, with ~0.05 GRAM attached. */
export function nftTransferBody(p: NftTransferParams): Cell {
  const b = beginCell()
    .storeUint(OP('nft_transfer'), 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeAddress(p.newOwner)
    .storeAddress(p.responseDestination)
    .storeMaybeRef(p.customPayload ?? null)
    .storeCoins(p.forwardAmount ?? 0n)
  return storeForwardPayload(b, p.forwardPayload).endCell()
}

/** excesses#d53276db query_id:uint64 */
export function excessesBody(queryId = 0n): Cell {
  return beginCell().storeUint(OP('excesses'), 32).storeUint(queryId, 64).endCell()
}

/** TEP-89 provide_wallet_address#2c76b973. Send to a jetton master to learn owner's jetton wallet. */
export function provideWalletAddressBody(p: { queryId?: bigint, owner: Address, includeAddress?: boolean }): Cell {
  return beginCell()
    .storeUint(OP('provide_wallet_address'), 32)
    .storeUint(p.queryId ?? 0n, 64)
    .storeAddress(p.owner)
    .storeBit(p.includeAddress ?? false)
    .endCell()
}

/** TEP-62 get_static_data#2fcb26a2. */
export function nftGetStaticDataBody(queryId = 0n): Cell {
  return beginCell().storeUint(OP('nft_get_static_data'), 32).storeUint(queryId, 64).endCell()
}

// ---------------------------------------------------------------- message hashes

/** Hash (hex) of a full message BOC, e.g. the external message TonConnect returns. */
export function messageHash(boc: string | Cell): string {
  return (typeof boc === 'string' ? parseBoc(boc) : boc).hash().toString('hex')
}

/**
 * TEP-467 normalized hash (hex) of an external-in message: src and import_fee zeroed, init dropped,
 * body forced into a ref. Stable across wallets/relayers; toncenter v3 indexes it as `hash_norm`.
 */
export function normalizedExtMessageHash(boc: string | Cell): string {
  const msg = loadMessage((typeof boc === 'string' ? parseBoc(boc) : boc).beginParse())
  if (msg.info.type !== 'external-in') throw new Error('Not an external-in message')
  const norm = beginCell().store(storeMessage({
    info: { type: 'external-in', src: null, dest: msg.info.dest, importFee: 0n },
    init: null,
    body: msg.body
  }, { forceRef: true })).endCell()
  return norm.hash().toString('hex')
}

// ---------------------------------------------------------------- decoder

export type DecodedValue = string | number | bigint | boolean | null | DecodedBody

export interface DecodedBody {
  /** Unsigned op, or null when the body has fewer than 32 bits. */
  op: number | null
  opHex: string | null
  /** snake_case name from opcodes.ts, or 'empty' / 'unknown'. */
  name: string
  /** Human label. */
  title: string
  info?: OpcodeInfo
  /** Parsed fields in TL-B order. Addresses are user-friendly strings, amounts bigint. */
  fields: Record<string, DecodedValue>
  /** Set when the op is known but the body did not match its layout. */
  error?: string
}

export interface DecodeOptions {
  /** Render addresses in testnet form (kQ… / 0Q…). */
  testOnly?: boolean
}

type FieldReader = (s: Slice, f: Record<string, DecodedValue>, o: DecodeOptions) => void

const addr = (s: Slice, o: DecodeOptions): string | null => {
  const a = s.loadAddressAny()
  if (!a) return null
  return Address.isAddress(a) ? a.toString({ testOnly: o.testOnly }) : a.toString()
}

const boc = (c: Cell | null) => (c ? c.toBoc().toString('base64') : null)

function forwardPayload(s: Slice, o: DecodeOptions): DecodedValue {
  const inRef = s.loadBit()
  const payload = inRef ? s.loadRef() : s.asCell()
  if (payload.bits.length === 0 && payload.refs.length === 0) return null
  return decodeBody(payload, o)
}

const queryId: FieldReader = (s, f) => {
  f.query_id = s.loadUintBig(64)
}

const READERS: Record<string, FieldReader> = {
  text_comment: (s, f) => {
    f.text = s.loadStringTail()
  },
  encrypted_comment: (s, f) => {
    // Decryption needs the sender's or recipient's private key, so only the ciphertext is shown.
    f.ciphertext = boc(s.asCell())
  },
  jetton_transfer: (s, f, o) => {
    queryId(s, f, o)
    f.amount = s.loadCoins()
    f.destination = addr(s, o)
    f.response_destination = addr(s, o)
    f.custom_payload = boc(s.loadMaybeRef())
    f.forward_ton_amount = s.loadCoins()
    f.forward_payload = forwardPayload(s, o)
  },
  jetton_internal_transfer: (s, f, o) => {
    queryId(s, f, o)
    f.amount = s.loadCoins()
    f.from = addr(s, o)
    f.response_address = addr(s, o)
    f.forward_ton_amount = s.loadCoins()
    f.forward_payload = forwardPayload(s, o)
  },
  jetton_transfer_notification: (s, f, o) => {
    queryId(s, f, o)
    f.amount = s.loadCoins()
    f.sender = addr(s, o)
    f.forward_payload = forwardPayload(s, o)
  },
  excesses: queryId,
  jetton_burn: (s, f, o) => {
    queryId(s, f, o)
    f.amount = s.loadCoins()
    f.response_destination = addr(s, o)
    f.custom_payload = boc(s.loadMaybeRef())
  },
  jetton_burn_notification: (s, f, o) => {
    queryId(s, f, o)
    f.amount = s.loadCoins()
    f.sender = addr(s, o)
    f.response_destination = addr(s, o)
  },
  provide_wallet_address: (s, f, o) => {
    queryId(s, f, o)
    f.owner_address = addr(s, o)
    f.include_address = s.loadBit()
  },
  take_wallet_address: (s, f, o) => {
    queryId(s, f, o)
    f.wallet_address = addr(s, o)
    const r = s.loadMaybeRef()
    f.owner_address = r ? addr(r.beginParse(), o) : null
  },
  jetton_mint: (s, f, o) => {
    queryId(s, f, o)
    f.to_address = addr(s, o)
    f.ton_amount = s.loadCoins()
    f.master_msg = decodeBody(s.loadRef(), o)
  },
  jetton_change_admin: (s, f, o) => {
    queryId(s, f, o)
    f.new_admin_address = addr(s, o)
  },
  jetton_claim_admin: queryId,
  top_up: queryId,
  nft_transfer: (s, f, o) => {
    queryId(s, f, o)
    f.new_owner = addr(s, o)
    f.response_destination = addr(s, o)
    f.custom_payload = boc(s.loadMaybeRef())
    f.forward_amount = s.loadCoins()
    f.forward_payload = forwardPayload(s, o)
  },
  nft_ownership_assigned: (s, f, o) => {
    queryId(s, f, o)
    f.prev_owner = addr(s, o)
    f.forward_payload = forwardPayload(s, o)
  },
  nft_get_static_data: queryId,
  nft_report_static_data: (s, f, o) => {
    queryId(s, f, o)
    f.index = s.loadUintBig(256)
    f.collection = addr(s, o)
  },
  get_royalty_params: queryId,
  report_royalty_params: (s, f, o) => {
    queryId(s, f, o)
    f.numerator = s.loadUint(16)
    f.denominator = s.loadUint(16)
    f.destination = addr(s, o)
  },
  sbt_destroy: queryId,
  sbt_revoke: queryId,
  dns_change_record: (s, f, o) => {
    queryId(s, f, o)
    f.key = s.loadUintBig(256).toString(16).padStart(64, '0')
    f.value = boc(s.remainingRefs ? s.loadRef() : null)
  }
}

/**
 * Decodes a message body by its op code. Never throws: unknown ops come back as name 'unknown',
 * malformed known ops keep the fields read so far plus `error`. Forward payloads are decoded recursively.
 */
export function decodeBody(body: Cell | string, opts: DecodeOptions = {}): DecodedBody {
  let cell: Cell
  try {
    cell = typeof body === 'string' ? parseBoc(body) : body
  }
  catch (e) {
    return { op: null, opHex: null, name: 'invalid', title: 'Invalid BOC', fields: {}, error: (e as Error).message }
  }
  const s = cell.beginParse()
  if (s.remainingBits < 32) {
    const empty = s.remainingBits === 0 && s.remainingRefs === 0
    return { op: null, opHex: null, name: empty ? 'empty' : 'raw', title: empty ? 'Empty body' : 'Raw data (no op code)', fields: {} }
  }
  const op = s.loadUint(32)
  const info = opcodeInfo(op)
  const out: DecodedBody = { op, opHex: opHex(op), name: info?.name ?? 'unknown', title: info?.title ?? 'Unknown op code', info, fields: {} }
  const reader = info && READERS[info.name]
  if (reader) {
    try {
      reader(s, out.fields, opts)
    }
    catch (e) {
      out.error = `Body does not match ${info.name}: ${(e as Error).message}`
    }
  }
  return out
}
