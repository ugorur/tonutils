import { Address, beginCell, type Cell } from '@ton/core'
import { cellFromApi, libraryHashOf } from '~/lib/contracts-read/cells'
import { parseBoc } from '~/utils/ton/messages'

// ---------------------------------------------------------------- arguments

export type ArgType = 'num' | 'address' | 'cell' | 'slice'
export interface ArgInput { type: ArgType, value: string }
/** toncenter /api/v3/runGetMethod stack entry. */
export interface StackEntry { type: string, value: unknown }

/** Decimal or 0x-hex (optionally negative) integer. */
export function parseNum(s: string): bigint {
  const t = s.trim().replace(/_/g, '')
  const m = /^(-)?(0x[0-9a-f]+|\d+)$/i.exec(t)
  if (!m) throw new Error(`"${s}" is not an integer. Use decimal (123) or hex (0x7b).`)
  const v = BigInt(m[2]!)
  return m[1] ? -v : v
}

const hexNum = (v: bigint) => (v < 0n ? `-0x${(-v).toString(16)}` : `0x${v.toString(16)}`)

/** User argument -> toncenter v3 stack entry (num as hex string, address as a slice BOC, cell/slice as base64 BOC). */
export function toStackEntry(arg: ArgInput, index: number): StackEntry {
  const where = `Argument ${index + 1}`
  try {
    switch (arg.type) {
      case 'num': return { type: 'num', value: hexNum(parseNum(arg.value)) }
      case 'address': return { type: 'slice', value: beginCell().storeAddress(Address.parse(arg.value.trim())).endCell().toBoc().toString('base64') }
      case 'cell':
      case 'slice': return { type: arg.type, value: parseBoc(arg.value).toBoc().toString('base64') }
    }
  }
  catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`)
  }
}

// ---------------------------------------------------------------- results

export type Decoded =
  | { kind: 'num', value: bigint, dec: string, hex: string, bool?: boolean }
  | { kind: 'cell', type: string, boc: string, hashHex: string, bits: number, refs: number, address?: Address | null, text?: string, uri?: string, onchainMeta?: boolean, library?: string }
  | { kind: 'tuple', type: string, items: Decoded[] }
  | { kind: 'null' }
  | { kind: 'unknown', type: string, raw: unknown }

/** Bytes of a snake-encoded string (data + first-ref chain), or null if the bits are not whole bytes. */
function snakeBytes(c: Cell): Buffer | null {
  const parts: Buffer[] = []
  for (let cur: Cell | undefined = c; cur; cur = cur.refs[0]) {
    if (cur.bits.length % 8 || cur.refs.length > 1) return null
    parts.push(cur.beginParse().loadBuffer(cur.bits.length / 8))
  }
  return Buffer.concat(parts)
}

function printable(b: Buffer): string | undefined {
  if (!b.length) return undefined
  const s = new TextDecoder('utf-8', { fatal: false }).decode(b)
  // eslint-disable-next-line no-control-regex
  return !s.includes('�') && !/[\u0000-\u0008\u000E-\u001F\u007F]/.test(s) ? s : undefined
}

export function decodeCell(type: string, boc: string): Decoded {
  const c = cellFromApi(boc)
  const out: Extract<Decoded, { kind: 'cell' }> = {
    kind: 'cell',
    type,
    boc: c.toBoc().toString('base64'),
    hashHex: c.hash().toString('hex'),
    bits: c.bits.length,
    refs: c.refs.length
  }
  const lib = libraryHashOf(c)
  if (lib) return { ...out, library: lib }
  // A lone MsgAddressInt (267 bits) or addr_none (2 zero bits).
  if (!c.refs.length && (c.bits.length === 267 || c.bits.length === 2)) {
    try {
      out.address = c.beginParse().loadMaybeAddress()
      return out
    }
    catch { /* not an address */ }
  }
  // TEP-64 on-chain content: 0x00 prefix + dictionary
  if (c.bits.length >= 8 && c.refs.length && c.beginParse().preloadUint(8) === 0) return { ...out, onchainMeta: true }
  const bytes = snakeBytes(c)
  if (bytes) {
    // TEP-64 off-chain content: 0x01 + URI
    if (bytes[0] === 1) out.uri = printable(bytes.subarray(1))
    else out.text = printable(bytes)
  }
  return out
}

export function decodeEntry(e: StackEntry): Decoded {
  switch (e.type) {
    case 'num': {
      const v = parseNum(String(e.value))
      return { kind: 'num', value: v, dec: v.toString(), hex: hexNum(v), bool: v === -1n ? true : v === 0n ? false : undefined }
    }
    case 'cell':
    case 'slice':
      return decodeCell(e.type, String(e.value))
    case 'tuple':
    case 'list':
      return { kind: 'tuple', type: e.type, items: Array.isArray(e.value) ? (e.value as StackEntry[]).map(decodeEntry) : [] }
    case 'null':
      return { kind: 'null' }
    default:
      return { kind: 'unknown', type: e.type, raw: e.value }
  }
}

// ---------------------------------------------------------------- exit codes

/** TVM exit codes most often seen when running get-methods (docs.ton.org, "TVM exit codes"). */
export const EXIT_CODES: Record<number, string> = {
  0: 'Success',
  1: 'Success (alternative)',
  2: 'Stack underflow: the method expected more arguments than you passed',
  3: 'Stack overflow',
  4: 'Integer overflow',
  5: 'Integer out of expected range',
  6: 'Invalid opcode',
  7: 'Type check error: an argument has the wrong type (for example a number where a slice is expected)',
  8: 'Cell overflow',
  9: 'Cell underflow: the contract read more data than a cell holds',
  10: 'Dictionary error',
  11: 'Method not found, or an unknown error in the contract',
  12: 'Fatal error',
  13: 'Out of gas',
  [-14]: 'Out of gas',
  14: 'Virtualization error',
  // toncenter answers -13 with gas_used 0 for an account without code (observed 2026-10-22 on 0:00…0123)
  [-13]: 'The account has no code: it is not deployed (uninit) or frozen'
}

export const exitInfo = (code: number) => ({ ok: code === 0 || code === 1, text: EXIT_CODES[code] ?? 'Error thrown by the contract (custom exit code)' })

// ---------------------------------------------------------------- presets

/** Argument templates for well-known methods (TEP-74, TEP-62, TEP-81, wallet v4). */
export const METHOD_ARGS: Record<string, { type: ArgType, label: string }[]> = {
  get_wallet_address: [{ type: 'address', label: 'Owner address' }],
  get_nft_address_by_index: [{ type: 'num', label: 'Item index' }],
  get_nft_content: [{ type: 'num', label: 'Item index' }, { type: 'cell', label: 'Individual content (cell BOC)' }],
  is_plugin_installed: [{ type: 'num', label: 'Workchain' }, { type: 'num', label: 'Plugin address hash (0x…)' }]
}

export const COMMON_METHODS = ['seqno', 'get_public_key', 'get_wallet_data', 'get_jetton_data', 'get_nft_data', 'get_collection_data', 'get_wallet_address']

/** Valid FunC/Tolk get-method name. */
export const isMethodName = (s: string) => /^[A-Za-z_][\w?!']*$/.test(s.trim())
