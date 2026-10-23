import type { TonNetwork } from '~/composables/useTonNetwork'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { v5WalletId } from '~/lib/wallet-derivation/wallets'
import { DEFAULT_SUBWALLET_ID, NETWORK_GLOBAL_ID } from '~/utils/ton/wallets'

export { v5WalletId }

/**
 * W5 (wallet v5R1) wallet_id, from wallet-contract-v5 / @ton/ton WalletV5R1WalletId:
 *   wallet_id = network_global_id XOR context      (int32)
 *   client context  = 1 | workchain:int8 | wallet_version:uint8 (0 = v5r1) | subwallet_number:uint15
 *   custom context  = 0 | counter:uint31
 */
export type V5Context =
  | { kind: 'client', workchain: number, walletVersion: number, subwallet: number }
  | { kind: 'custom', counter: number }

export interface WalletIdForms {
  /** int32, as stored in the contract data and passed to @ton/ton. */
  signed: number
  /** uint32, as toncenter/tonapi show it. */
  unsigned: number
  hex: string
}

export function walletIdForms(id: number): WalletIdForms {
  const unsigned = id >>> 0
  return { signed: id | 0, unsigned, hex: `0x${unsigned.toString(16).padStart(8, '0')}` }
}

/** Accepts decimal (signed or unsigned 32-bit) or 0x hex. Returns the int32 value. */
export function parseWalletId(input: string): number {
  const s = input.trim().replace(/[\s_,]/g, '')
  if (!s) throw new Error('Enter a wallet_id')
  let n: number
  if (/^0x[0-9a-f]{1,8}$/i.test(s)) n = parseInt(s.slice(2), 16)
  else if (/^-?\d+$/.test(s)) n = Number(s)
  else throw new Error('Use a decimal number or 0x hex, like 2147483409 or 0x7fffff11')
  if (n < -0x80000000 || n > 0xffffffff) throw new Error('A wallet_id is a 32-bit number')
  return n | 0
}

/** The context packed in a wallet_id, read with a given network_global_id. */
export function decodeContext(id: number, networkGlobalId: number): V5Context {
  const ctx = (id ^ networkGlobalId) >>> 0
  if (ctx >>> 31) {
    return { kind: 'client', workchain: ((ctx >>> 23) & 0xff) << 24 >> 24, walletVersion: (ctx >>> 15) & 0xff, subwallet: ctx & 0x7fff }
  }
  return { kind: 'custom', counter: ctx & 0x7fffffff }
}

/** A standard client context: version 0 (v5r1) on the basechain or masterchain. */
export function isStandardContext(c: V5Context): boolean {
  return c.kind === 'client' && c.walletVersion === 0 && (c.workchain === 0 || c.workchain === -1)
}

export const NETWORKS: { id: TonNetwork, globalId: number }[] = [
  { id: 'mainnet', globalId: NETWORK_GLOBAL_ID.mainnet },
  { id: 'testnet', globalId: NETWORK_GLOBAL_ID.testnet }
]

/** v3/v4 subwallet_id that wallets use by default: 698983191 + workchain. */
export function defaultSubwalletId(workchain: number): number {
  return DEFAULT_SUBWALLET_ID + workchain
}

/** W5 address for a public key and any wallet_id. `workchain` applies to custom contexts; a client context carries its own. */
export function v5Address(publicKey: Buffer, walletId: number, networkGlobalId: number, workchain: number) {
  const c = decodeContext(walletId, networkGlobalId)
  if (c.kind === 'custom') return WalletContractV5R1.create({ workchain, publicKey, walletId: { networkGlobalId, context: c.counter } }).address
  if (c.walletVersion !== 0) throw new Error(`wallet_version ${c.walletVersion} is not v5r1 (0)`)
  // For a client context @ton/ton takes the address workchain from the context itself.
  const context = { walletVersion: 'v5r1' as const, workchain: c.workchain, subwalletNumber: c.subwallet }
  return WalletContractV5R1.create({ publicKey, walletId: { networkGlobalId, context } }).address
}

/** v4R2 address for a public key and subwallet_id. */
export function v4Address(publicKey: Buffer, subwalletId: number, workchain: number) {
  return WalletContractV4.create({ workchain, publicKey, walletId: subwalletId >>> 0 }).address
}
