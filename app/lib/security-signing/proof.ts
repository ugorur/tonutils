// TonConnect ton_proof (spec connect.md "Address proof signature"): parse a connect result, rebuild the signed
// bytes step by step, resolve the public key and verify. Pure TS (imports @ton/core, @ton/crypto), client/test only.
import { Address } from '@ton/core'
import { sha256_sync, signVerify } from '@ton/crypto'
import { publicKeyFromStateInit } from '~/tools/sign-message/logic'

export interface TonProof {
  timestamp: number
  domain: { lengthBytes: number, value: string }
  payload: string
  signature: string
}

/** Everything a backend receives after a TonConnect connect with ton_proof. */
export interface ProofInput {
  address: string
  network?: string
  publicKey?: string
  walletStateInit?: string
  proof: TonProof
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/** True when the JSON looks like a ton_proof result (has a proof with a domain). */
export function looksLikeProof(o: unknown): boolean {
  try {
    return !!findProof(o as Obj).proof
  }
  catch {
    return false
  }
}

function findProof(root: Obj) {
  let o = root
  if (o.event === 'connect' && obj(o.payload)) o = o.payload as Obj
  const items = Array.isArray(o.items) ? o.items as Obj[] : Array.isArray(root) ? root as Obj[] : []
  const addrItem = items.find(i => i?.name === 'ton_addr')
  const proofItem = items.find(i => i?.name === 'ton_proof')
  const connectItems = obj(o.connectItems)
  const holder = obj(connectItems?.tonProof) ?? obj(o.tonProof) ?? proofItem
  const err = obj(holder?.error)
  if (err) throw new Error(`The wallet returned an error instead of a proof: ${str(err.message) ?? `code ${err.code}`}`)
  const p = obj(o.proof) ?? obj(holder?.proof)
  return { o, account: obj(o.account) ?? addrItem ?? o, proof: p && obj(p.domain) ? p : undefined }
}

/**
 * Accepts the shapes people actually paste: the demo backend's CheckProofRequest ({ address, network, public_key,
 * proof: { …, state_init } }), the @tonconnect/ui wallet object ({ account, connectItems.tonProof }), a raw
 * ConnectEvent, or its items array. Throws a readable Error.
 */
export function parseProofInput(json: string): ProofInput {
  let root: Obj
  try {
    root = JSON.parse(json)
  }
  catch {
    throw new Error('Not valid JSON. Paste the connect result exactly as your dApp received it.')
  }
  if (!root || typeof root !== 'object') throw new Error('Expected a JSON object.')
  const { o, account, proof } = findProof(root)
  if (!proof) throw new Error('No ton_proof found. The JSON needs a proof object with timestamp, domain, payload and signature.')
  const address = str(account.address) ?? str(o.address)
  if (!address) throw new Error('No wallet address found (address or account.address).')
  try {
    Address.parse(address)
  }
  catch {
    throw new Error(`"${address}" is not a valid TON address.`)
  }
  const d = proof.domain as Obj
  const timestamp = Number(proof.timestamp)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('proof.timestamp must be a unix time in seconds.')
  if (typeof d.value !== 'string') throw new Error('proof.domain.value is missing.')
  if (typeof proof.signature !== 'string') throw new Error('proof.signature is missing.')
  const pk = str(account.publicKey) ?? str(account.public_key) ?? str(o.public_key) ?? str(o.publicKey)
  return {
    address,
    network: str(account.network) ?? str(account.chain) ?? str(o.network) ?? (typeof account.chain === 'number' ? String(account.chain) : undefined),
    publicKey: pk?.replace(/^0x/, '').toLowerCase(),
    walletStateInit: str(account.walletStateInit) ?? str(o.walletStateInit) ?? str(o.state_init) ?? str(o.stateInit) ?? str(proof.state_init) ?? str(proof.stateInit),
    proof: {
      timestamp,
      domain: { lengthBytes: Number(d.lengthBytes ?? new TextEncoder().encode(d.value).length), value: d.value },
      payload: typeof proof.payload === 'string' ? proof.payload : '',
      signature: proof.signature
    }
  }
}

export interface ProofPart { label: string, hex: string, note: string }
export interface ProofSteps {
  workchain: number
  addressHash: string
  parts: ProofPart[]
  message: string
  messageHash: string
  preimage: string
  signedHash: string
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

/** Rebuilds message = "ton-proof-item-v2/" ++ wc ++ hash ++ len(domain) ++ domain ++ ts ++ payload and both hashes. */
export function proofSteps(input: Pick<ProofInput, 'address' | 'proof'>): ProofSteps {
  const a = Address.parse(input.address)
  const domain = Buffer.from(input.proof.domain.value, 'utf8')
  const wc = Buffer.alloc(4)
  wc.writeInt32BE(a.workChain)
  const len = Buffer.alloc(4)
  len.writeUInt32LE(domain.length)
  const ts = Buffer.alloc(8)
  ts.writeBigUInt64LE(BigInt(input.proof.timestamp))
  const parts: ProofPart[] = [
    { label: 'Prefix', hex: hex(Buffer.from('ton-proof-item-v2/')), note: 'utf8 "ton-proof-item-v2/"' },
    { label: 'Workchain', hex: hex(wc), note: `int32 big-endian (${a.workChain})` },
    { label: 'Address hash', hex: hex(a.hash), note: '256-bit account id' },
    { label: 'Domain length', hex: hex(len), note: `uint32 little-endian (${domain.length} bytes)` },
    { label: 'Domain', hex: hex(domain), note: `utf8 "${input.proof.domain.value}"` },
    { label: 'Timestamp', hex: hex(ts), note: `uint64 little-endian (${input.proof.timestamp})` },
    { label: 'Payload', hex: hex(Buffer.from(input.proof.payload, 'utf8')), note: 'utf8, as sent by the dApp' }
  ]
  const message = Buffer.concat(parts.map(p => Buffer.from(p.hex, 'hex')))
  const messageHash = sha256_sync(message)
  const preimage = Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), messageHash])
  return {
    workchain: a.workChain,
    addressHash: hex(a.hash),
    parts,
    message: hex(message),
    messageHash: hex(messageHash),
    preimage: hex(preimage),
    signedHash: hex(sha256_sync(preimage))
  }
}

/** Ed25519 check of the proof signature against a 32-byte hex key. */
export function verifyProof(input: Pick<ProofInput, 'address' | 'proof'>, publicKeyHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) throw new Error('Public key must be 32 bytes of hex.')
  const sig = Buffer.from(input.proof.signature, 'base64')
  if (sig.length !== 64) return false
  return signVerify(Buffer.from(proofSteps(input).signedHash, 'hex'), sig, Buffer.from(publicKeyHex, 'hex'))
}

export type CheckState = 'pass' | 'fail' | 'warn' | 'info'
export interface ProofCheck { label: string, state: CheckState, detail: string }

export const NETWORK_NAMES: Record<string, string> = { '-239': 'mainnet', '-3': 'testnet' }

/** Non-cryptographic checks a backend must also run: domain, freshness, payload, network. */
export function proofChecks(input: ProofInput, opts: { now?: number, maxAgeSec?: number, expectedDomain?: string, expectedPayload?: string } = {}): ProofCheck[] {
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const maxAge = opts.maxAgeSec ?? 900
  const p = input.proof
  const out: ProofCheck[] = []
  const real = new TextEncoder().encode(p.domain.value).length
  out.push(real === p.domain.lengthBytes
    ? { label: 'Domain length', state: 'pass', detail: `lengthBytes ${p.domain.lengthBytes} matches the UTF-8 length of the domain` }
    : { label: 'Domain length', state: 'fail', detail: `lengthBytes says ${p.domain.lengthBytes} but "${p.domain.value}" is ${real} bytes. Reject: the fields were edited or built wrongly.` })
  out.push(/^[^.]+(\.[^.]+)+$/.test(p.domain.value)
    ? { label: 'Domain format', state: 'pass', detail: 'Contains a dot with text on both sides' }
    : { label: 'Domain format', state: 'fail', detail: 'Names without a dot (like "tonkeeper") are reserved for native wallet integrations and must not be accepted from a dApp.' })
  if (opts.expectedDomain) {
    out.push(p.domain.value === opts.expectedDomain
      ? { label: 'Domain is yours', state: 'pass', detail: `Signed for ${p.domain.value}` }
      : { label: 'Domain is yours', state: 'fail', detail: `Signed for "${p.domain.value}", not "${opts.expectedDomain}". A proof made for another site must be rejected.` })
  }
  else {
    out.push({ label: 'Domain is yours', state: 'info', detail: `Signed for "${p.domain.value}". Your backend must compare it with the host of your manifest url.` })
  }
  const age = now - p.timestamp
  const when = new Date(p.timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
  if (age < -60) out.push({ label: 'Freshness', state: 'fail', detail: `Signed ${when}, ${-age} s in the future. The wallet clock is wrong or the proof was forged.` })
  else if (age > maxAge) out.push({ label: 'Freshness', state: 'warn', detail: `Signed ${when}, ${fmtAge(age)} ago (limit ${fmtAge(maxAge)}). A live backend would reject it as expired.` })
  else out.push({ label: 'Freshness', state: 'pass', detail: `Signed ${when}, ${fmtAge(Math.max(age, 0))} ago` })
  if (opts.expectedPayload !== undefined && opts.expectedPayload !== '') {
    out.push(p.payload === opts.expectedPayload
      ? { label: 'Payload', state: 'pass', detail: 'Matches the payload you issued' }
      : { label: 'Payload', state: 'fail', detail: 'Differs from the payload you issued. Reject: it may be a replayed proof.' })
  }
  else {
    out.push({ label: 'Payload', state: 'info', detail: p.payload ? 'Your backend must check this is a nonce it issued, unexpired and not used before.' : 'Empty payload: without a server nonce the proof can be replayed.' })
  }
  if (input.network) {
    const name = NETWORK_NAMES[input.network]
    out.push({ label: 'Network', state: name ? 'info' : 'warn', detail: name ? `${name} (${input.network}). The proof does not sign the network, so check it yourself.` : `Unknown network id ${input.network}` })
  }
  return out
}

function fmtAge(s: number): string {
  if (s < 120) return `${s} s`
  if (s < 7200) return `${Math.round(s / 60)} min`
  if (s < 172800) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} days`
}

export interface KeyResolution {
  publicKey: string
  source: 'stateinit' | 'chain' | 'provided'
  detail: string
  /** Set when a key the wallet reported differs from the verified one. */
  mismatch?: string
  /** Set when nothing ties the key to the address. */
  warning?: string
}

/**
 * Key that controls the address, in spec order: the walletStateInit (must hash to the address and be a known
 * wallet), then the chain (get_public_key, via `onchain`, which returns null when the account has no key getter),
 * then the key the wallet reported (unverified). A StateInit for another address throws.
 */
export async function resolvePublicKey(i: { address: string, walletStateInit?: string, publicKey?: string }, onchain: (rawAddress: string) => Promise<string | null>): Promise<KeyResolution> {
  const mismatch = (k: string) => (i.publicKey && i.publicKey !== k ? `The wallet reported public key ${i.publicKey}, which is not the key that controls the address. Reject the connection.` : undefined)
  let stateInitNote = ''
  if (i.walletStateInit) {
    try {
      const r = publicKeyFromStateInit(i.address, i.walletStateInit)
      return { publicKey: r.publicKey, source: 'stateinit', detail: `From walletStateInit (${r.version}); its hash equals the address`, mismatch: mismatch(r.publicKey) }
    }
    catch (e) {
      const msg = (e as Error).message
      if (/does not belong/.test(msg)) throw new Error('The walletStateInit does not hash to this address, so it belongs to another account. Reject the proof.')
      stateInitNote = ` (walletStateInit unusable: ${msg})`
    }
  }
  const raw = Address.parse(i.address).toRawString()
  const k = (await onchain(raw))?.toLowerCase()
  if (k) return { publicKey: k, source: 'chain', detail: `Read from the deployed wallet (get_public_key)${stateInitNote}`, mismatch: mismatch(k) }
  if (i.publicKey && /^[0-9a-f]{64}$/.test(i.publicKey)) {
    return { publicKey: i.publicKey, source: 'provided', detail: `Reported by the wallet${stateInitNote}`, warning: 'The key could not be read from a StateInit or from the chain, so nothing ties it to the address. A valid signature only proves the key holder signed.' }
  }
  throw new Error(`Cannot find the public key: the account has no key getter on chain and the input has no usable walletStateInit or publicKey${stateInitNote}.`)
}
