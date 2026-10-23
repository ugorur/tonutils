// Vanity wallet search. Dependency-free (WebCrypto only) so it runs in a bare Web Worker:
// Ed25519 keys come from crypto.subtle, and the wallet address is hashed directly from the
// StateInit cell layout instead of building @ton/core Cells (the code cell hash is constant).

export type VanityVersion = 'v5r1' | 'v4r2'
export type VanityMode = 'mnemonic' | 'key'

export interface VanityOptions {
  mode: VanityMode
  versions: VanityVersion[]
  testnet: boolean
  /** Match against the bounceable (EQ/kQ) form instead of the non-bounceable (UQ/0Q) one. Only the suffix differs. */
  bounceable: boolean
  /** Characters right after the 2-letter flag prefix. */
  prefix: string
  suffix: string
  caseSensitive: boolean
  /** BIP39/TON English word list, needed in mnemonic mode. */
  wordlist?: readonly string[]
}

export interface VanityMatch {
  version: VanityVersion
  address: string
  publicKey: string
  /** 32-byte private key (ed25519 seed), hex. */
  privateKey: string
  /** 24 words in mnemonic mode. */
  mnemonic?: string[]
}

export interface SearchSlice {
  /** Keys tried (each is checked against every selected version). */
  tried: number
  found: VanityMatch[]
}

/** WebCrypto wants ArrayBuffer-backed views. */
export type Bytes = Uint8Array<ArrayBuffer>

export const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Wallet code cell hash and depth (checked against @ton/ton in the tests). */
export const WALLET_CODE: Record<VanityVersion, { hash: string, depth: number, label: string }> = {
  v5r1: { hash: '20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f', depth: 6, label: 'W5 (v5R1)' },
  v4r2: { hash: 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0', depth: 7, label: 'Wallet v4R2' }
}
const CODE_HASH = Object.fromEntries(Object.entries(WALLET_CODE).map(([k, v]) => [k, hex2bytes(v.hash)])) as Record<VanityVersion, Bytes>

const subtle = () => globalThis.crypto.subtle
const enc = new TextEncoder()

export function hex2bytes(hex: string): Bytes {
  return Uint8Array.from(hex.match(/../g) ?? [], b => parseInt(b, 16))
}
export function bytes2hex(b: Bytes): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

// ---------- patterns ----------

/** Removes a pasted flag prefix (UQ/EQ/0Q/kQ): those two characters are fixed, the search starts after them. */
export function normalizePrefix(prefix: string): string {
  const p = prefix.trim()
  return /^(UQ|EQ|0Q|kQ)./.test(p) ? p.slice(2) : p
}

/** Readable problem with a pattern, or null if it can be searched. */
export function patternError(prefix: string, suffix: string, caseSensitive = false): string | null {
  if (!prefix && !suffix) return 'Enter a prefix, a suffix or both'
  for (const [name, s] of [['Prefix', prefix], ['Suffix', suffix]] as const) {
    const bad = [...s].find(c => !B64URL.includes(c))
    if (bad) return `${name} has "${bad}". Addresses only use A–Z, a–z, 0–9, - and _`
    if (s.length > 10) return `${name} is too long to ever be found`
  }
  if (prefix && !(caseSensitive ? 'ABCD' : 'ABCDabcd').includes(prefix[0]!)) {
    return 'The third character of a basechain address is always A, B, C or D (upper case), so the prefix must start with one of them'
  }
  return null
}

/** Chance that one address matches. */
export function matchProbability(prefix: string, suffix: string, caseSensitive: boolean): number {
  const p = (c: string) => !caseSensitive && /[a-z]/i.test(c) ? 2 / 64 : 1 / 64
  let prob = 1
  ;[...prefix].forEach((c, i) => {
    prob *= i === 0 ? 1 / 4 : p(c)
  })
  for (const c of suffix) prob *= p(c)
  return prob
}

/** Expected number of keys to try, when each key is checked against `versions` addresses. */
export function expectedTries(prefix: string, suffix: string, caseSensitive: boolean, versions: number): number {
  return 1 / (1 - (1 - matchProbability(prefix, suffix, caseSensitive)) ** versions)
}

export function matches(address: string, prefix: string, suffix: string, caseSensitive: boolean): boolean {
  const a = caseSensitive ? address : address.toLowerCase()
  const pre = caseSensitive ? prefix : prefix.toLowerCase()
  const suf = caseSensitive ? suffix : suffix.toLowerCase()
  return a.startsWith(pre, 2) && a.endsWith(suf)
}

// ---------- addresses ----------

function crc16(data: Bytes): number {
  let crc = 0
  for (const byte of data) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc
}

/** User-friendly basechain address (base64url, 48 chars) for an account hash. */
export function friendlyAddress(hash: Bytes, bounceable: boolean, testnet: boolean): string {
  const b = new Uint8Array(36)
  b[0] = (bounceable ? 0x11 : 0x51) | (testnet ? 0x80 : 0)
  b[1] = 0
  b.set(hash, 2)
  const crc = crc16(b.subarray(0, 34))
  b[34] = crc >> 8
  b[35] = crc & 0xff
  let s = ''
  for (let i = 0; i < 36; i += 3) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!
    s += B64URL[n >> 18]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!
  }
  return s
}

/** v4R2 data: seqno:32 subwallet_id:32 public_key:256 plugins:1 (321 bits). */
function v4DataRepr(pub: Bytes): Bytes {
  const r = new Uint8Array(43)
  r[0] = 0 // no refs
  r[1] = 81 // floor(321/8) + ceil(321/8)
  r.set([0x29, 0xa9, 0xa3, 0x17], 6) // 698983191
  r.set(pub, 10)
  r[42] = 0x40 // plugins bit 0, then the completion tag
  return r
}

/** v5R1 data: is_signature_allowed:1 seqno:32 wallet_id:32 public_key:256 extensions:1 (322 bits). */
function v5DataRepr(pub: Bytes, testnet: boolean): Bytes {
  const walletId = testnet ? 2147483645 : 2147483409
  const s = new Uint8Array(40) // seqno, wallet_id, public key: shifted right by the leading bit
  new DataView(s.buffer).setUint32(4, walletId)
  s.set(pub, 8)
  const r = new Uint8Array(43)
  r[1] = 81
  r[2] = 0x80 | (s[0]! >> 1)
  for (let i = 1; i < 40; i++) r[2 + i] = ((s[i - 1]! & 1) << 7) | (s[i]! >> 1)
  r[42] = ((s[39]! & 1) << 7) | 0x20 // last key bit, extensions bit 0, completion tag
  return r
}

/** StateInit hash = account id: refs code + data, bits 00110 (no split_depth, no special, code, data, no library). */
async function stateInitHash(version: VanityVersion, dataHash: Bytes): Promise<Bytes> {
  const r = new Uint8Array(71)
  r[0] = 2 // two refs
  r[1] = 1 // 5 bits -> ceil = 1, floor = 0
  r[2] = 0x34
  r[4] = WALLET_CODE[version].depth // code depth (high byte 0), data depth 0
  r.set(CODE_HASH[version], 7)
  r.set(dataHash, 39)
  return new Uint8Array(await subtle().digest('SHA-256', r))
}

/** Account hash of a standard wallet (workchain 0, default subwallet) for a public key. */
export async function walletHash(version: VanityVersion, pub: Bytes, testnet: boolean): Promise<Bytes> {
  const data = version === 'v4r2' ? v4DataRepr(pub) : v5DataRepr(pub, testnet)
  return stateInitHash(version, new Uint8Array(await subtle().digest('SHA-256', data)))
}

// ---------- keys ----------

const PKCS8_ED25519 = hex2bytes('302e020100300506032b657004220420')

/** Ed25519 public key for a 32-byte private seed, through WebCrypto. */
export async function publicKeyFromSeed(seed: Bytes): Promise<Bytes> {
  const pkcs8 = new Uint8Array(48)
  pkcs8.set(PKCS8_ED25519)
  pkcs8.set(seed, 16)
  const key = await subtle().importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign'])
  const jwk = await subtle().exportKey('jwk', key)
  return base64urlDecode(jwk.x!)
}

function base64urlDecode(s: string): Bytes {
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const c of s) {
    buf = (buf << 6) | B64URL.indexOf(c)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

async function pbkdf2(key: Bytes, salt: string, iterations: number, bits: number): Promise<Bytes> {
  const k = await subtle().importKey('raw', key, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt: enc.encode(salt), iterations }, k, bits))
}

/** tonlib Mnemonic::to_entropy: HMAC-SHA512(key = words joined by spaces, message = password ""). */
async function tonEntropy(words: string[]): Promise<Bytes> {
  const k = await subtle().importKey('raw', enc.encode(words.join(' ')), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  return new Uint8Array(await subtle().sign('HMAC', k, new Uint8Array(0)))
}

/** tonlib is_basic_seed: a phrase TON wallets accept without a password. */
export async function isBasicTonMnemonic(words: string[]): Promise<boolean> {
  return (await pbkdf2(await tonEntropy(words), 'TON seed version', 390, 8))[0] === 0
}

/** TON mnemonic → 32-byte ed25519 seed (PBKDF2-SHA512, "TON default seed", 100000 rounds). */
export async function tonMnemonicSeed(words: string[]): Promise<Bytes> {
  return pbkdf2(await tonEntropy(words), 'TON default seed', 100000, 256)
}

// ---------- search ----------

async function check(opts: VanityOptions, pub: Bytes): Promise<{ version: VanityVersion, address: string }[]> {
  const hits = []
  for (const version of opts.versions) {
    const address = friendlyAddress(await walletHash(version, pub, opts.testnet), opts.bounceable, opts.testnet)
    if (matches(address, opts.prefix, opts.suffix, opts.caseSensitive)) hits.push({ version, address })
  }
  return hits
}

/** Random keys for about budgetMs. Fast: thousands of keys per second per core. */
export async function searchKeys(opts: VanityOptions, budgetMs: number, batch = 128): Promise<SearchSlice> {
  const end = Date.now() + budgetMs
  const found: VanityMatch[] = []
  let tried = 0
  do {
    await Promise.all(Array.from({ length: batch }, async () => {
      const kp = await subtle().generateKey({ name: 'Ed25519' }, true, ['sign']) as CryptoKeyPair
      const pub = new Uint8Array(await subtle().exportKey('raw', kp.publicKey))
      for (const hit of await check(opts, pub)) {
        const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', kp.privateKey))
        found.push({ ...hit, publicKey: bytes2hex(pub), privateKey: bytes2hex(pkcs8.subarray(16)) })
      }
    }))
    tried += batch
  } while (Date.now() < end && !found.length)
  return { tried, found }
}

function randomWords(wordlist: readonly string[]): string[] {
  // 2048 divides 65536, so masking 16 random bits is uniform.
  return Array.from(crypto.getRandomValues(new Uint16Array(24)), n => wordlist[n & 2047]!)
}

/** Random valid 24-word TON mnemonics for about budgetMs. Slow by design: 100 000 PBKDF2 rounds per phrase. */
export async function searchMnemonics(opts: VanityOptions, budgetMs: number, parallel = 8): Promise<SearchSlice> {
  if (!opts.wordlist || opts.wordlist.length !== 2048) throw new Error('Word list missing')
  const end = Date.now() + budgetMs
  const found: VanityMatch[] = []
  let tried = 0
  const lane = async () => {
    while (Date.now() < end && !found.length) {
      const words = randomWords(opts.wordlist!)
      if (!(await isBasicTonMnemonic(words))) continue
      const seed = await tonMnemonicSeed(words)
      const pub = await publicKeyFromSeed(seed)
      tried++
      for (const hit of await check(opts, pub)) {
        found.push({ ...hit, publicKey: bytes2hex(pub), privateKey: bytes2hex(seed), mnemonic: words })
      }
    }
  }
  await Promise.all(Array.from({ length: parallel }, lane))
  return { tried, found }
}

/** Runs one search slice in the requested mode. */
export function searchSlice(opts: VanityOptions, budgetMs: number): Promise<SearchSlice> {
  return opts.mode === 'key' ? searchKeys(opts, budgetMs) : searchMnemonics(opts, budgetMs)
}

/** Ed25519 in WebCrypto: Chrome 137+, Firefox 129+, Safari 17+. */
export async function supportsEd25519(): Promise<boolean> {
  try {
    await subtle().generateKey({ name: 'Ed25519' }, false, ['sign'])
    return true
  }
  catch {
    return false
  }
}
