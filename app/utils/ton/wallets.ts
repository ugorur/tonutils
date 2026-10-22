// Wallet contract versions: code hashes, detection, and addresses derived from a public key.
// Client-only in practice (@ton/ton uses Buffer). Import from Tool.vue / logic.ts.
import type { Address } from '@ton/core'
import type { TonNetwork } from '~/composables/useTonNetwork'
import {
  WalletContractV1R1, WalletContractV1R2, WalletContractV1R3, WalletContractV2R1, WalletContractV2R2,
  WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5Beta, WalletContractV5R1
} from '@ton/ton'

/** TonConnect / W5 network global id. */
export const NETWORK_GLOBAL_ID: Record<TonNetwork, number> = { mainnet: -239, testnet: -3 }
/** Default subwallet id for v3/v4 on workchain 0 (698983191 = 0x29a9a317). */
export const DEFAULT_SUBWALLET_ID = 698983191

export type WalletVersion =
  | 'v1r1' | 'v1r2' | 'v1r3' | 'v2r1' | 'v2r2' | 'v3r1' | 'v3r2' | 'v4r1' | 'v4r2' | 'v5beta' | 'v5r1'
  | 'highload-v2' | 'highload-v2r1' | 'highload-v2r2' | 'highload-v3' | 'preprocessed-v2' | 'vesting' | 'multisig-v2'

export interface WalletKind {
  version: WalletVersion
  label: string
  /** addressesForPublicKey can derive it (address fully determined by public key + network). */
  derivable: boolean
}

/**
 * Code hash (base64) -> wallet kind. Verified 2026-10-22 against live mainnet accounts: toncenter v3
 * accountStates (code_hash + indexer interface) over the top 4000 accounts by balance. v2r2 is checked
 * against @ton/ton's embedded code, v4r1 against tonweb 0.0.66's embedded code (no live sample found).
 */
export const WALLET_CODE_HASHES: Record<string, WalletKind> = {
  'oM/CxIruFqJx8s/AtzgtgXVs7LEBfQd/qqs7tgL2how=': { version: 'v1r1', label: 'Wallet v1R1', derivable: true },
  '1JAvzJ+tdGmPqONTIgpo2g3PcuMryy657gQhfBfTBiw=': { version: 'v1r2', label: 'Wallet v1R2', derivable: true },
  'WHzHie/xyE9G7DeX5F/ICaFP9a4k8eDHpqmcydyQYf8=': { version: 'v1r3', label: 'Wallet v1R3', derivable: true },
  'XJpeaMEI4YchoHxC+ZVr+zmtd+xtYktgxXbsiO7mUyk=': { version: 'v2r1', label: 'Wallet v2R1', derivable: true },
  '/pUw0yQ4Uwg+8u8LTCkIwKv2+hwx6iQ6rKpb+MfXU/E=': { version: 'v2r2', label: 'Wallet v2R2', derivable: true },
  'thBBpYp5gLlG6PueGY48kE0keZ/6NldOpCUcQaVm9YE=': { version: 'v3r1', label: 'Wallet v3R1', derivable: true },
  'hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=': { version: 'v3r2', label: 'Wallet v3R2', derivable: true },
  'ZN1UgFUixb6KnbWc6gEFzPDQh4bKeb64y3nogKjXMi0=': { version: 'v4r1', label: 'Wallet v4R1', derivable: false },
  '/rX/aCDi/w2Ug+fg1iyBfYRniftK5YDIeIZtlZ2r1cA=': { version: 'v4r2', label: 'Wallet v4R2', derivable: true },
  '89fKU0k97trCizgZhqhJQDy6w9LFhHea8IEGWvCsS5M=': { version: 'v5beta', label: 'Wallet W5 beta', derivable: true },
  'IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=': { version: 'v5r1', label: 'Wallet W5 (v5R1)', derivable: true },
  'lJTRzI7fEvBWcaGpugmSEJbrUIEeGSTsZcPGKfu4CBI=': { version: 'highload-v2', label: 'Highload wallet v2', derivable: false },
  'oFnyMYGrJKaXUljAkyYaTQ/YhIJc9LML4c3pB2tzCSc=': { version: 'highload-v2', label: 'Highload wallet v2', derivable: false },
  'jOtFs81LXMYOquHBO5wJI5Jnf+U2sumy2AG2Lv+TH+E=': { version: 'highload-v2r1', label: 'Highload wallet v2R1', derivable: false },
  'ID3U81ittJmTEpqpJcrDmRa2ig5PeNJujywraer6Vnk=': { version: 'highload-v2r2', label: 'Highload wallet v2R2', derivable: false },
  'EayteVWEQJDyg78ji8FEmHH3g+fMCXlAjT9IWUg+hSU=': { version: 'highload-v3', label: 'Highload wallet v3', derivable: false },
  'Reu86bXSNYhstr/hw62TtwjeBYJEiSNlye4N/kOct7U=': { version: 'preprocessed-v2', label: 'Preprocessed wallet v2', derivable: false },
  'tItTGr7DtxRjgpH3137W3J9qJynvyiBHcTc3TUrotZA=': { version: 'vesting', label: 'Vesting wallet', derivable: false },
  '09FNqaYn8Ow1MzQYKXYq+SuVQLIb8DZl+sCcK0bqu6w=': { version: 'multisig-v2', label: 'Multisig v2', derivable: false }
}

function toBase64Hash(hash: string): string {
  const s = hash.trim()
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex').toString('base64')
  return s.replace(/-/g, '+').replace(/_/g, '/')
}

/** Wallet kind for a contract code hash (base64, base64url or hex), or null for non-wallets / unknown code. */
export function detectWalletVersion(codeHash: string): WalletKind | null {
  return WALLET_CODE_HASHES[toBase64Hash(codeHash)] ?? null
}

export interface DerivedWallet {
  version: WalletVersion
  label: string
  address: Address
  /** 0:hex */
  raw: string
  /** UQ… / 0Q… — the form to share for receiving. */
  nonBounceable: string
  /** EQ… / kQ… */
  bounceable: string
}

/** Versions addressesForPublicKey derives, newest first (v4r1 omitted: no maintained implementation). */
export const STANDARD_WALLET_VERSIONS = ['v5r1', 'v4r2', 'v3r2', 'v3r1', 'v5beta', 'v2r2', 'v2r1', 'v1r3', 'v1r2', 'v1r1'] as const
export type StandardWalletVersion = typeof STANDARD_WALLET_VERSIONS[number]

function create(version: StandardWalletVersion, publicKey: Buffer, network: TonNetwork, workchain: number) {
  const networkGlobalId = NETWORK_GLOBAL_ID[network]
  switch (version) {
    // W5 bakes the network id into its wallet id, so testnet is a different account, not just a flag.
    case 'v5r1': return WalletContractV5R1.create({ workchain, publicKey, walletId: { networkGlobalId } })
    case 'v5beta': return WalletContractV5Beta.create({ publicKey, walletId: { networkGlobalId, workchain } })
    case 'v4r2': return WalletContractV4.create({ workchain, publicKey })
    case 'v3r2': return WalletContractV3R2.create({ workchain, publicKey })
    case 'v3r1': return WalletContractV3R1.create({ workchain, publicKey })
    case 'v2r2': return WalletContractV2R2.create({ workchain, publicKey })
    case 'v2r1': return WalletContractV2R1.create({ workchain, publicKey })
    case 'v1r3': return WalletContractV1R3.create({ workchain, publicKey })
    case 'v1r2': return WalletContractV1R2.create({ workchain, publicKey })
    case 'v1r1': return WalletContractV1R1.create({ workchain, publicKey })
  }
}

/**
 * Standard wallet addresses (default subwallet) a public key controls on one network.
 * publicKey: 32 bytes as Buffer/Uint8Array or 64 hex chars.
 */
export function addressesForPublicKey(
  publicKey: Uint8Array | string,
  network: TonNetwork,
  opts: { workchain?: number, versions?: readonly StandardWalletVersion[] } = {}
): DerivedWallet[] {
  const key = typeof publicKey === 'string' ? Buffer.from(publicKey.replace(/^0x/, ''), 'hex') : Buffer.from(publicKey)
  if (key.length !== 32) throw new Error('A public key is 32 bytes (64 hex characters)')
  const testOnly = network === 'testnet'
  const labels = Object.fromEntries(Object.values(WALLET_CODE_HASHES).map(k => [k.version, k.label]))
  return (opts.versions ?? STANDARD_WALLET_VERSIONS).map((version) => {
    const address = create(version, key, network, opts.workchain ?? 0).address
    return {
      version,
      label: labels[version]!,
      address,
      raw: address.toRawString(),
      nonBounceable: address.toString({ bounceable: false, testOnly, urlSafe: true }),
      bounceable: address.toString({ bounceable: true, testOnly, urlSafe: true })
    }
  })
}
