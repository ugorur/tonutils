import type { DeriveOptions, WalletRow } from '~/lib/wallet-derivation/wallets'
import { deriveWallets, parsePublicKey } from '~/lib/wallet-derivation/wallets'

export { parsePublicKey }

/** Every standard wallet address for a public key (hex or base64), newest version first. */
export function addressesFromPublicKey(input: string, opts: DeriveOptions): WalletRow[] {
  return deriveWallets(parsePublicKey(input), opts)
}
