// Seed phrase helpers shared by the wallet-derivation tools: parsing, TON vs BIP39 checks, BIP39 seed and
// SLIP-10 ed25519 derivation. Everything runs locally; nothing here touches the network.
import {
  deriveEd25519Path, hmac_sha512, keyPairFromSeed, mnemonicToPrivateKey, mnemonicValidate, mnemonicWordList,
  pbkdf2_sha512, sha256
} from '@ton/crypto'

/** The TON wordlist is the BIP39 English list (2048 words, "abandon" … "zoo"). */
export const WORDLIST: readonly string[] = mnemonicWordList
const INDEX = new Map(WORDLIST.map((w, i) => [w, i]))

export const BIP39_LENGTHS = [12, 15, 18, 21, 24] as const

/** Words from free text: case-insensitive, ignores numbering ("1. word"), commas and line breaks. */
export function parsePhrase(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? []
}

export function isWord(w: string): boolean {
  return INDEX.has(w)
}

/** Closest wordlist entries for a mistyped word: same 4-letter prefix first (BIP39 prefixes are unique), then edit distance ≤ 2. */
export function suggestWords(word: string, max = 3): string[] {
  const scored: [string, number][] = []
  for (const w of WORDLIST) {
    const d = w.startsWith(word.slice(0, 4)) && word.length >= 4 ? 0 : editDistance(word, w, 2)
    if (d <= 2) scored.push([w, d])
  }
  return scored.sort((a, b) => a[1] - b[1]).slice(0, max).map(s => s[0])
}

function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

// ---------- BIP39 ----------

/** BIP39 checksum check (English list). Returns false for unknown words or a wrong word count. */
export async function bip39Validate(words: string[]): Promise<boolean> {
  if (!(BIP39_LENGTHS as readonly number[]).includes(words.length) || !words.every(isWord)) return false
  const bits = words.map(w => INDEX.get(w)!.toString(2).padStart(11, '0')).join('')
  const csLen = bits.length / 33
  const entBits = bits.slice(0, bits.length - csLen)
  const entropy = Buffer.from(entBits.match(/.{8}/g)!.map(b => parseInt(b, 2)))
  const hash = await sha256(entropy)
  const cs = [...hash].map(b => b.toString(2).padStart(8, '0')).join('').slice(0, csLen)
  return cs === bits.slice(-csLen)
}

/** BIP39 seed: PBKDF2-HMAC-SHA512(mnemonic, "mnemonic" + passphrase, 2048) → 64 bytes. */
export function bip39Seed(words: string[], passphrase = ''): Promise<Buffer> {
  return pbkdf2_sha512(words.join(' ').normalize('NFKD'), `mnemonic${passphrase}`.normalize('NFKD'), 2048, 64)
}

// ---------- SLIP-10 ed25519 ----------

/** Parses "m/44'/607'/0'" into [44, 607, 0]. ed25519 (SLIP-10) only has hardened levels, so every level needs ' or h. */
export function parsePath(path: string): number[] {
  const parts = path.trim().replace(/\s+/g, '').split('/')
  if (parts.shift()?.toLowerCase() !== 'm') throw new Error('A path starts with m/, like m/44\'/607\'/0\'')
  return parts.map((p) => {
    const m = /^(\d+)['hH]$/.exec(p)
    if (!m) throw new Error(`"${p}" is not hardened. ed25519 keys only support hardened levels (add ').`)
    const n = Number(m[1])
    if (n >= 0x80000000) throw new Error(`Level ${n} is too large (max 2147483647)`)
    return n
  })
}

export function formatPath(levels: number[]): string {
  return ['m', ...levels.map(n => `${n}'`)].join('/')
}

export interface KeyPairHex {
  /** 32-byte private key (ed25519 seed), hex. */
  privateKey: string
  /** 32-byte public key, hex. */
  publicKey: string
}

function keysFromSeed(seed: Buffer): KeyPairHex {
  const kp = keyPairFromSeed(seed)
  return { privateKey: seed.toString('hex'), publicKey: kp.publicKey.toString('hex') }
}

/** SLIP-10 ed25519 key at a hardened path from a BIP39 seed. */
export async function slip10Key(seed: Buffer, path: number[]): Promise<KeyPairHex> {
  return keysFromSeed(await deriveEd25519Path(seed, path))
}

// ---------- TON mnemonic ----------

export type TonPhraseKind = 'ton' | 'ton-password' | 'none'

/**
 * How TON wallets see the phrase: a normal TON mnemonic, one created with a password
 * (tonlib's "password seed" marker), or not a TON mnemonic. Mirrors tonlib Mnemonic.cpp.
 */
export async function tonPhraseKind(words: string[]): Promise<TonPhraseKind> {
  if (!words.length || !words.every(isWord)) return 'none'
  if (await mnemonicValidate(words)) return 'ton'
  const entropy = await hmac_sha512(words.join(' '), '')
  const marker = await pbkdf2_sha512(entropy, 'TON fast seed version', 1, 64)
  return marker[0] === 1 ? 'ton-password' : 'none'
}

/** Keys of a TON mnemonic (optionally password-protected). Throws a readable error if it does not validate. */
export async function tonKeys(words: string[], password = ''): Promise<KeyPairHex> {
  if (!(await mnemonicValidate(words, password || undefined))) {
    throw new Error(password ? 'This phrase and password are not a valid TON mnemonic' : 'Not a valid TON mnemonic')
  }
  const kp = await mnemonicToPrivateKey(words, password || undefined)
  return { privateKey: kp.secretKey.subarray(0, 32).toString('hex'), publicKey: kp.publicKey.toString('hex') }
}
