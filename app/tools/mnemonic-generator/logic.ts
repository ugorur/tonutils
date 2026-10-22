import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'

export type WalletVersion = 'v3r2' | 'v4r2' | 'v5r1'

export const NETWORK_GLOBAL_ID = { mainnet: -239, testnet: -3 } as const

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

function walletAddress(version: WalletVersion, publicKey: Buffer, net: keyof typeof NETWORK_GLOBAL_ID) {
  switch (version) {
    case 'v3r2':
      return WalletContractV3R2.create({ workchain: 0, publicKey }).address
    case 'v4r2':
      return WalletContractV4.create({ workchain: 0, publicKey }).address
    case 'v5r1':
      // W5 bakes the network id into its wallet id, so testnet is a different account, not just a flag.
      return WalletContractV5R1.create({ workchain: 0, publicKey, walletId: { networkGlobalId: NETWORK_GLOBAL_ID[net] } }).address
  }
}

/** Standard wallet addresses (workchain 0, default subwallet) for a public key. */
export function walletsForPublicKey(publicKey: Buffer): WalletAddresses[] {
  return (['v5r1', 'v4r2', 'v3r2'] as const).map((version) => {
    const forNet = (net: 'mainnet' | 'testnet') => {
      const a = walletAddress(version, publicKey, net)
      const testOnly = net === 'testnet'
      return {
        nonBounceable: a.toString({ bounceable: false, testOnly, urlSafe: true }),
        bounceable: a.toString({ bounceable: true, testOnly, urlSafe: true }),
        raw: a.toRawString()
      }
    }
    return { version, label: WALLET_LABELS[version], mainnet: forNet('mainnet'), testnet: forNet('testnet') }
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
