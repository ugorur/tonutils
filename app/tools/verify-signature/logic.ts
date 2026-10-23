// Universal TON signature checker: TonConnect signData bundles, ton_proof login proofs, and raw Ed25519.
// signData rules live in the sign-message tool, ton_proof rules in app/lib/security-signing/proof.ts.
import { sha256_sync, signVerify } from '@ton/crypto'
import type { ProofInput } from '~/lib/security-signing/proof'
import { looksLikeProof, parseProofInput } from '~/lib/security-signing/proof'
import type { SignatureBundle } from '~/tools/sign-message/logic'
import { parseBundle } from '~/tools/sign-message/logic'

export type Detected = { kind: 'proof', input: ProofInput } | { kind: 'signData', bundle: SignatureBundle }

/** Tells a ton_proof connect result from a signData bundle and parses it. Throws a readable Error. */
export function detectBundle(json: string): Detected {
  let o: unknown
  try {
    o = JSON.parse(json)
  }
  catch {
    throw new Error('Not valid JSON. Paste the signature bundle or connect result exactly as you received it.')
  }
  if (looksLikeProof(o)) return { kind: 'proof', input: parseProofInput(json) }
  return { kind: 'signData', bundle: parseBundle(json) }
}

export type Encoding = 'text' | 'hex' | 'base64'

/** Decodes user input in the chosen encoding. Throws on malformed hex/base64. */
export function decodeBytes(value: string, enc: Encoding): Buffer {
  if (enc === 'text') return Buffer.from(value, 'utf8')
  const v = value.replace(/\s+/g, '')
  if (enc === 'hex') {
    const h = v.replace(/^0x/i, '')
    if (h.length % 2 || !/^[0-9a-f]*$/i.test(h)) throw new Error('Not valid hex (0-9, a-f, even length).')
    return Buffer.from(h, 'hex')
  }
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(v)) throw new Error('Not valid base64.')
  return Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** 64-byte signature from hex (128 chars) or base64/base64url. */
export function parseSignature(value: string): Buffer {
  const v = value.trim().replace(/^0x/i, '')
  const b = /^[0-9a-f]{128}$/i.test(v) ? Buffer.from(v, 'hex') : decodeBytes(v, 'base64')
  if (b.length !== 64) throw new Error(`An Ed25519 signature is 64 bytes; this is ${b.length}.`)
  return b
}

/** 32-byte public key from hex or base64. Returns null when the input is not a key (it may be an address). */
export function parsePublicKey(value: string): string | null {
  const v = value.trim().replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase()
  if (/^[A-Za-z0-9+/]{43}=$/.test(v)) return Buffer.from(v, 'base64').toString('hex')
  return null
}

/**
 * Plain Ed25519 check. Some signers sign sha256(message) instead of the message itself, so that is tried too and
 * reported. Returns which form matched, or null.
 */
export function verifyRaw(message: Buffer, signature: Buffer, publicKeyHex: string): 'message' | 'sha256' | null {
  const key = Buffer.from(publicKeyHex, 'hex')
  if (signVerify(message, signature, key)) return 'message'
  if (signVerify(sha256_sync(message), signature, key)) return 'sha256'
  return null
}
