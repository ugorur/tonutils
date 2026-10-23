import { Address, beginCell, Cell } from '@ton/core'
import type { TupleItem } from '@ton/core'
import type { AccountSnapshot } from '~/lib/accounts-history/state'
import { detectWalletVersion } from '~/utils/ton/wallets'

/** "2024-01-01T12:00" (local, from <input type="datetime-local">) or a full ISO string -> unix seconds. */
export function parseWhen(input: string): number | null {
  const t = Date.parse(input)
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

/**
 * Get-method arguments, one per line (or comma-separated): integers (decimal, negative, 0x hex) become ints,
 * TON addresses become address slices, base64 BOCs (te6cc…) become cells.
 */
export function parseArgs(text: string): TupleItem[] {
  return text.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map((s) => {
    if (/^-?\d+$/.test(s)) return { type: 'int', value: BigInt(s) }
    if (/^-?0x[0-9a-f]+$/i.test(s)) return { type: 'int', value: s.startsWith('-') ? -BigInt(s.slice(1)) : BigInt(s) }
    if (s.startsWith('te6cc')) {
      try {
        return { type: 'cell', cell: Cell.fromBase64(s) }
      }
      catch { /* fall through */ }
    }
    try {
      return { type: 'slice', cell: beginCell().storeAddress(Address.parse(s)).endCell() }
    }
    catch {
      throw new Error(`Argument "${s}" is not a number, a TON address or a base64 BOC.`)
    }
  })
}

export interface StackRow {
  type: string
  value: string
  /** Second reading of the same value (hex for ints, address for slices). */
  alt?: string
}

/** A slice holding exactly one standard address, as a friendly string. */
function asAddress(c: Cell, testOnly: boolean): string | null {
  try {
    const s = c.beginParse()
    const a = s.loadAddress()
    return s.remainingBits === 0 && s.remainingRefs === 0 ? a.toString({ testOnly }) : null
  }
  catch {
    return null
  }
}

export function formatStack(items: TupleItem[], testOnly = false): StackRow[] {
  return items.map((it): StackRow => {
    switch (it.type) {
      case 'int': return { type: 'int', value: it.value.toString(), alt: (it.value < 0n ? '-0x' : '0x') + (it.value < 0n ? -it.value : it.value).toString(16) }
      case 'null': return { type: 'null', value: 'null' }
      case 'nan': return { type: 'NaN', value: 'NaN' }
      case 'tuple': return { type: `tuple(${it.items.length})`, value: JSON.stringify(formatStack(it.items, testOnly).map(r => r.alt ?? r.value)) }
      default: {
        const addr = asAddress(it.cell, testOnly)
        return { type: it.type, value: it.cell.toBoc().toString('base64'), alt: addr ?? undefined }
      }
    }
  })
}

const WALLET_METHODS = ['seqno', 'get_public_key', 'get_subwallet_id']
const COMMON_METHODS = ['get_jetton_data', 'get_wallet_data', 'get_nft_data', 'get_collection_data', 'get_pool_data']

/** Get-method names worth offering as one-click chips for this account. */
export function suggestMethods(s: AccountSnapshot): { wallet: string | null, methods: string[] } {
  const kind = s.codeHash ? detectWalletVersion(s.codeHash) : null
  if (!kind) return { wallet: null, methods: ['seqno', 'get_public_key', ...COMMON_METHODS] }
  const extra = kind.version === 'v4r2' || kind.version === 'v4r1' ? ['get_plugin_list'] : kind.version === 'v5r1' ? ['get_extensions', 'is_signature_allowed'] : []
  return { wallet: kind.label, methods: [...WALLET_METHODS, ...extra] }
}

/** Friendly text for TVM exit codes a get-method commonly ends with. */
export function exitCodeHint(code: number): string | null {
  if (code === 0 || code === 1) return null
  if (code === 11) return 'The contract has no get-method with this name (exit code 11), or it threw error 11.'
  if (code === 2) return 'Stack underflow (exit code 2): the method probably needs arguments.'
  if (code === 7) return 'Type check error (exit code 7): an argument has the wrong type.'
  if (code === -14 || code === 13) return 'Out of gas.'
  return `The method failed with exit code ${code}.`
}
