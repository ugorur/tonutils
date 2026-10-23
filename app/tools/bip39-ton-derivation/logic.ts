import type { TonNetwork } from '~/composables/useTonNetwork'
import type { KeyPairHex } from '~/lib/wallet-derivation/phrase'
import { bip39Seed, bip39Validate, formatPath, isWord, parsePath, parsePhrase, slip10Key, tonPhraseKind } from '~/lib/wallet-derivation/phrase'

export { formatPath, parsePath }

export interface PathSpec {
  label: string
  path: number[]
}

/** Trust Wallet Core registry.json: TON derivation m/44'/607'/0', wallet v4R2. */
export const TRUST_WALLET_PATH = [44, 607, 0]

/** Ledger TON app (ton-ledger-ts pathForAccount): m/44'/607'/network'/0'/account'/0', network 0 = mainnet, 1 = testnet. */
export function ledgerPath(account: number, network: TonNetwork = 'mainnet'): number[] {
  return [44, 607, network === 'testnet' ? 1 : 0, 0, account, 0]
}

export type Bip39Problem = 'empty' | 'unknown-words' | 'length' | 'checksum' | 'ton'

export type DeriveResult =
  | { ok: true, keys: (PathSpec & KeyPairHex)[] }
  | { ok: false, problem: Bip39Problem, unknown?: string[] }

/** BIP39 phrase (+ optional passphrase) → SLIP-10 ed25519 keys at each path. Offline. */
export async function deriveBip39(text: string, passphrase: string, paths: PathSpec[]): Promise<DeriveResult> {
  const words = parsePhrase(text)
  if (!words.length) return { ok: false, problem: 'empty' }
  const unknown = words.filter(w => !isWord(w))
  if (unknown.length) return { ok: false, problem: 'unknown-words', unknown: [...new Set(unknown)] }
  if (!(await bip39Validate(words))) {
    if ((await tonPhraseKind(words)) !== 'none') return { ok: false, problem: 'ton' }
    return { ok: false, problem: [12, 15, 18, 21, 24].includes(words.length) ? 'checksum' : 'length' }
  }
  const seed = await bip39Seed(words, passphrase)
  const keys = await Promise.all(paths.map(async p => ({ ...p, ...(await slip10Key(seed, p.path)) })))
  return { ok: true, keys }
}
