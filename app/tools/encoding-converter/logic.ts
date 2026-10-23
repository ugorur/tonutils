import { Address } from '@ton/core'
import { Buffer } from 'buffer'
import { type ByteFormat, encodeBytes, parseBytes } from '~/lib/crypto/bytes'

export const OUTPUT_FORMATS: ByteFormat[] = ['hex', 'base64', 'base64url', 'base32', 'decimal', 'utf8', 'bytes']

export interface Conversion {
  bytes: Uint8Array
  /** Every format; utf8 is null when the bytes are not valid UTF-8 text. */
  out: Record<ByteFormat, string | null>
  /** Set when the input is exactly 32 bytes: the same value read as a basechain account hash. */
  address: { raw: string, bounceable: string, nonBounceable: string } | null
}

export function convert(input: string, from: ByteFormat): Conversion {
  if (from !== 'utf8' && !input.trim()) throw new Error('Enter a value to convert.')
  const bytes = parseBytes(input, from)
  const out = Object.fromEntries(OUTPUT_FORMATS.map(f => [f, encodeBytes(bytes, f)])) as Conversion['out']
  let address: Conversion['address'] = null
  if (bytes.length === 32) {
    const a = new Address(0, Buffer.from(bytes))
    address = {
      raw: a.toRawString(),
      bounceable: a.toString({ bounceable: true, urlSafe: true }),
      nonBounceable: a.toString({ bounceable: false, urlSafe: true })
    }
  }
  return { bytes, out, address }
}

/**
 * Guess the format of pasted text. Order matters: anything hex-looking is treated as hex,
 * TON base32 (ADNL) is lowercase a-z2-7, base64 is the fallback for its alphabet.
 */
export function detectFormat(input: string): ByteFormat {
  // Line breaks are wrapping (base64 from CLIs, hex dumps); spaces still mean text.
  const s = input.trim().replace(/[\r\n]+/g, '')
  if (!s) return 'utf8'
  if (/^\[[\d\s,x a-f]*\]$/i.test(s)) return 'bytes'
  if (/^0x[0-9a-f\s]+$/i.test(s) || (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s) && s.length % 2 === 0)) return 'hex'
  if (/^\d+$/.test(s)) return 'decimal'
  if (/^[a-z2-7]+$/.test(s) && /[2-7]/.test(s) && s.length >= 16) return 'base32'
  const b64ish = /[+/=]/.test(s) || (s.length >= 16 && /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s))
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0 && b64ish) return 'base64'
  if (/^[A-Za-z0-9_-]+$/.test(s) && (/[-_]/.test(s) || b64ish)) return 'base64url'
  return 'utf8'
}
