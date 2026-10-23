// TonConnect signData: what the wallet signs (spec rpc.md "Signature — text and binary" / "— cell") and an
// offline verifier for the resulting bundle. Pure TS (imports @ton/core, @ton/crypto).
import { Address, beginCell, Cell, contractAddress, loadStateInit } from '@ton/core'
import { sha256_sync, signVerify } from '@ton/crypto'
import { parseWalletData } from '~/lib/wallet-detection/state'
import { detectWalletVersion } from '~/utils/ton/wallets'

export type SignPayload =
  | { type: 'text', text: string }
  | { type: 'binary', bytes: string /* base64 */ }
  | { type: 'cell', schema: string, cell: string /* base64 BOC */ }

/** What we publish after signing: the wallet's SignDataResponse plus the key material needed to check it. */
export interface SignatureBundle {
  signature: string
  address: string
  timestamp: number
  domain: string
  payload: SignPayload & { network?: string, from?: string }
  publicKey?: string
  walletStateInit?: string
}

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

/** CRC-32 (IEEE, zlib) of the UTF-8 bytes: the schema hash of cell payloads. */
export function crc32(text: string): number {
  let c = 0xffffffff
  for (const b of new TextEncoder().encode(text)) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** TEP-81 DNS wire form used for cell payloads: "app.example.com" -> "com\0example\0app\0" (lowercased, as Tonkeeper does). */
export function encodeDomainDns(domain: string): string {
  return domain.toLowerCase().replace(/\.$/, '').split('.').reverse().map(p => `${p}\0`).join('')
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

/**
 * The 32 bytes the wallet's key signs. `schemaCrc` overrides crc32(schema) for cell payloads.
 * `legacyDomain`: cell payloads signed by wallets before the spec settled on the TEP-81 wire form stored the plain domain.
 */
export function signedHash(b: Pick<SignatureBundle, 'address' | 'timestamp' | 'domain' | 'payload'>, schemaCrc?: number, legacyDomain = false): Buffer {
  const addr = Address.parse(b.address)
  const p = b.payload
  if (p.type === 'cell') {
    return beginCell()
      .storeUint(0x75569022, 32)
      .storeUint(schemaCrc ?? crc32(p.schema), 32)
      .storeUint(b.timestamp, 64)
      .storeAddress(addr)
      .storeStringRefTail(legacyDomain ? b.domain : encodeDomainDns(b.domain))
      .storeRef(Cell.fromBase64(p.cell))
      .endCell()
      .hash()
  }
  const wc = Buffer.alloc(4)
  wc.writeInt32BE(addr.workChain)
  const domain = Buffer.from(b.domain, 'utf8')
  const ts = Buffer.alloc(8)
  ts.writeBigUInt64BE(BigInt(b.timestamp))
  const data = p.type === 'text' ? Buffer.from(p.text, 'utf8') : Buffer.from(p.bytes, 'base64')
  return sha256_sync(Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect/sign-data/'),
    wc,
    addr.hash,
    u32(domain.length),
    domain,
    ts,
    Buffer.from(p.type === 'text' ? 'txt' : 'bin'),
    u32(data.length),
    data
  ]))
}

const HEX64 = /^[0-9a-f]{64}$/i

/** Ed25519 check of the bundle against a public key. Cell payloads also accept the legacy plain-domain form. */
export function verifySignature(b: SignatureBundle, publicKeyHex: string, schemaCrc?: number): boolean {
  if (!HEX64.test(publicKeyHex)) throw new Error('Public key must be 32 bytes of hex')
  const sig = Buffer.from(b.signature, 'base64')
  if (sig.length !== 64) return false
  const key = Buffer.from(publicKeyHex, 'hex')
  if (signVerify(signedHash(b, schemaCrc), sig, key)) return true
  return b.payload.type === 'cell' && signVerify(signedHash(b, schemaCrc, true), sig, key)
}

/** Parses pasted JSON (our bundle, or a raw SignDataResponse with public_key). Throws a readable Error. */
export function parseBundle(json: string): SignatureBundle {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(json)
  }
  catch {
    throw new Error('Not valid JSON. Paste the signature bundle exactly as it was shared.')
  }
  if (o && typeof o.result === 'object' && o.result) o = { ...(o.result as Record<string, unknown>), ...o }
  const p = o.payload as SignPayload | undefined
  if (typeof o.signature !== 'string' || typeof o.address !== 'string' || typeof o.domain !== 'string' || typeof o.timestamp !== 'number' || !p) {
    throw new Error('Missing fields: a bundle needs signature, address, timestamp, domain and payload.')
  }
  if (!(p.type === 'text' && typeof p.text === 'string') && !(p.type === 'binary' && typeof p.bytes === 'string') && !(p.type === 'cell' && typeof p.cell === 'string' && typeof p.schema === 'string')) {
    throw new Error('Unknown payload: expected type text (text), binary (bytes) or cell (schema + cell).')
  }
  try {
    Address.parse(o.address)
  }
  catch {
    throw new Error('The address in the bundle is not a valid TON address.')
  }
  const pk = (o.publicKey ?? o.public_key) as string | undefined
  return {
    signature: o.signature,
    address: o.address,
    timestamp: o.timestamp,
    domain: o.domain,
    payload: p,
    publicKey: typeof pk === 'string' ? pk.replace(/^0x/, '').toLowerCase() : undefined,
    walletStateInit: typeof o.walletStateInit === 'string' ? o.walletStateInit : undefined
  }
}

/**
 * Public key from the wallet's StateInit, for wallets not deployed yet. The StateInit must hash to the
 * signer address (so it cannot be swapped), and its code must be a known wallet contract.
 */
export function publicKeyFromStateInit(address: string, stateInitB64: string): { publicKey: string, version: string } {
  const addr = Address.parse(address)
  const init = loadStateInit(Cell.fromBase64(stateInitB64).beginParse())
  if (!contractAddress(addr.workChain, init).equals(addr)) throw new Error('The StateInit in the bundle does not belong to the signer address.')
  if (!init.code || !init.data) throw new Error('The StateInit has no code or data.')
  const kind = detectWalletVersion(init.code.hash().toString('base64'))
  if (!kind) throw new Error('The StateInit is not a known wallet contract, so its key cannot be read.')
  const { publicKey } = parseWalletData(kind.version, init.data, { workchain: addr.workChain })
  if (!publicKey) throw new Error(`No public key in ${kind.label} data.`)
  return { publicKey, version: kind.label }
}

/** Human-readable payload for display. */
export function payloadPreview(p: SignPayload): string {
  if (p.type === 'text') return p.text
  if (p.type === 'binary') return Buffer.from(p.bytes, 'base64').toString('hex')
  return `${p.schema}\n${p.cell}`
}

/** Text the wallet will show and sign; including site, date and nonce makes replays obvious. */
export function defaultProofText(now = new Date()): string {
  return `I own this wallet. Signed on ${now.toISOString().slice(0, 10)} with tonutils.io (nonce ${Math.random().toString(36).slice(2, 10)}).`
}
