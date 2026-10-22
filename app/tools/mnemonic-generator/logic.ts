import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto'
import { addressesForPublicKey } from '~/utils/ton/wallets'

export type WalletVersion = 'v3r2' | 'v4r2' | 'v5r1'

export interface WalletAddresses {
  version: WalletVersion
  label: string
  /** Non-bounceable (UQ / 0Q): the form to share for receiving funds. */
  mainnet: { nonBounceable: string, bounceable: string, raw: string }
  testnet: { nonBounceable: string, bounceable: string, raw: string }
}

export interface DerivedKeys {
  /** 32-byte Ed25519 public key, hex. */
  publicKey: string
  /** 32-byte Ed25519 private key (seed), hex. */
  privateKey: string
  /** 64-byte secret key (seed + public key) as used by @ton/crypto and TonWeb, hex. */
  secretKey: string
  wallets: WalletAddresses[]
}

const WALLET_LABELS: Record<WalletVersion, string> = {
  v3r2: 'Wallet v3R2',
  v4r2: 'Wallet v4R2',
  v5r1: 'Wallet W5 (v5R1)'
}
const VERSIONS = ['v5r1', 'v4r2', 'v3r2'] as const

/** Standard wallet addresses (workchain 0, default subwallet) for a public key. */
export function walletsForPublicKey(publicKey: Buffer): WalletAddresses[] {
  const forNet = (net: 'mainnet' | 'testnet') => addressesForPublicKey(publicKey, net, { versions: VERSIONS })
  const [main, test] = [forNet('mainnet'), forNet('testnet')]
  return VERSIONS.map((version, i) => {
    const pick = (w: (typeof main)[number]) => ({ nonBounceable: w.nonBounceable, bounceable: w.bounceable, raw: w.raw })
    return { version, label: WALLET_LABELS[version], mainnet: pick(main[i]!), testnet: pick(test[i]!) }
  })
}

/** Derives keys and wallet addresses from a TON mnemonic. Throws if the phrase is not a valid TON mnemonic. */
export async function deriveFromMnemonic(words: string[]): Promise<DerivedKeys> {
  if (!(await mnemonicValidate(words))) throw new Error('Not a valid TON mnemonic')
  const keys = await mnemonicToPrivateKey(words)
  return {
    publicKey: keys.publicKey.toString('hex'),
    privateKey: keys.secretKey.subarray(0, 32).toString('hex'),
    secretKey: keys.secretKey.toString('hex'),
    wallets: walletsForPublicKey(keys.publicKey)
  }
}

/** New random 24-word TON mnemonic (no password), using the browser's CSPRNG. */
export function generateMnemonic(): Promise<string[]> {
  return mnemonicNew(24)
}
