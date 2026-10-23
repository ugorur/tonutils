// Wallet addresses for a public key with optional non-default subwallet ids (the shared
// addressesForPublicKey only covers the defaults). Client/logic only: imports @ton/ton.
import type { Address } from '@ton/core'
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { StandardWalletVersion } from '~/utils/ton/wallets'
import { WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { addressesForPublicKey, DEFAULT_SUBWALLET_ID, NETWORK_GLOBAL_ID, STANDARD_WALLET_VERSIONS } from '~/utils/ton/wallets'

export interface WalletRow {
  version: StandardWalletVersion
  label: string
  /** UQ… / 0Q… */
  nonBounceable: string
  /** EQ… / kQ… */
  bounceable: string
  /** 0:hex */
  raw: string
  /** The id baked into the contract data (v3/v4 subwallet_id, W5 wallet_id); absent for versions without one. */
  walletId?: number
}

export interface DeriveOptions {
  network: TonNetwork
  workchain?: number
  versions?: readonly StandardWalletVersion[]
  /** v3R1/v3R2/v4R2 subwallet_id. Default 698983191 + workchain. */
  subwalletId?: number
  /** W5 (v5R1) subwallet number, 0–32767. Default 0. */
  v5Subwallet?: number
}

/** W5 wallet_id for a client context: network_global_id XOR (1 | wc:int8 | version:uint8 = 0 | subwallet:uint15). */
export function v5WalletId(network: TonNetwork | number, workchain = 0, subwallet = 0): number {
  const gid = typeof network === 'number' ? network : NETWORK_GLOBAL_ID[network]
  const context = (1 << 31) | ((workchain & 0xff) << 23) | (subwallet & 0x7fff)
  return (gid ^ context) | 0
}

function customAddress(version: StandardWalletVersion, publicKey: Buffer, o: DeriveOptions, workchain: number): { address: Address, walletId: number } | null {
  if (version === 'v5r1') {
    const sub = o.v5Subwallet ?? 0
    // The workchain comes from the client context.
    const w = WalletContractV5R1.create({
      publicKey,
      walletId: { networkGlobalId: NETWORK_GLOBAL_ID[o.network], context: { walletVersion: 'v5r1', workchain, subwalletNumber: sub } }
    })
    return { address: w.address, walletId: v5WalletId(o.network, workchain, sub) }
  }
  const walletId = o.subwalletId ?? DEFAULT_SUBWALLET_ID + workchain
  if (version === 'v4r2') return { address: WalletContractV4.create({ workchain, publicKey, walletId }).address, walletId }
  if (version === 'v3r2') return { address: WalletContractV3R2.create({ workchain, publicKey, walletId }).address, walletId }
  if (version === 'v3r1') return { address: WalletContractV3R1.create({ workchain, publicKey, walletId }).address, walletId }
  return null
}

/** Addresses a public key controls, newest version first. publicKey: 32 bytes or 64 hex chars. */
export function deriveWallets(publicKey: Uint8Array | string, o: DeriveOptions): WalletRow[] {
  const workchain = o.workchain ?? 0
  const versions = o.versions ?? STANDARD_WALLET_VERSIONS
  const defaults = addressesForPublicKey(publicKey, o.network, { workchain, versions })
  const key = typeof publicKey === 'string' ? Buffer.from(publicKey.replace(/^0x/, ''), 'hex') : Buffer.from(publicKey)
  const testOnly = o.network === 'testnet'
  return defaults.map((d) => {
    const c = customAddress(d.version as StandardWalletVersion, key, o, workchain)
    const address = c?.address ?? d.address
    return {
      version: d.version as StandardWalletVersion,
      label: d.label,
      raw: address.toRawString(),
      nonBounceable: address.toString({ bounceable: false, testOnly, urlSafe: true }),
      bounceable: address.toString({ bounceable: true, testOnly, urlSafe: true }),
      walletId: c?.walletId
    }
  })
}

/** 32-byte public key from hex (optional 0x) or base64/base64url. Throws a readable error otherwise. */
export function parsePublicKey(input: string): Buffer {
  const s = input.trim()
  const hex = s.replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex')
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) {
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (b.length === 32) return b
  }
  throw new Error('A public key is 32 bytes: 64 hex characters (or 44 base64 characters)')
}
