// Byte <-> text encodings shared by the crypto-encoding tools. Pure TS (Buffer polyfill import works in node and browser).
import { Buffer } from 'buffer'

export type ByteFormat = 'utf8' | 'hex' | 'base64' | 'base64url' | 'base32' | 'decimal' | 'bytes'

export const FORMAT_LABELS: Record<ByteFormat, string> = {
  utf8: 'Text (UTF-8)',
  hex: 'Hex',
  base64: 'Base64',
  base64url: 'Base64url',
  base32: 'Base32',
  decimal: 'Big integer (decimal)',
  bytes: 'Byte array'
}

/** Formats a data field (message, key, salt) can be typed in. */
export const INPUT_FORMATS = ['utf8', 'hex', 'base64'] as const
export type InputFormat = typeof INPUT_FORMATS[number]

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** Parses text in the given format into bytes. Throws Error with a readable message. */
export function parseBytes(input: string, format: ByteFormat): Uint8Array {
  if (format === 'utf8') return new TextEncoder().encode(input)
  const s = input.trim()
  switch (format) {
    case 'hex': {
      const h = s.replace(/^0x/i, '').replace(/[\s:_-]/g, '')
      if (!/^[0-9a-f]*$/i.test(h)) throw new Error('Hex may only contain 0-9 and a-f.')
      if (h.length % 2) throw new Error(`Hex needs an even number of digits (got ${h.length}). Add a leading 0?`)
      return new Uint8Array(Buffer.from(h, 'hex'))
    }
    case 'base64':
    case 'base64url': {
      // Accept either alphabet, with or without padding: people paste both.
      const b = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
      if (!/^[A-Za-z0-9+/]*$/.test(b)) throw new Error('Base64 may only contain A-Z, a-z, 0-9, + / (or - _) and = padding.')
      if (b.length % 4 === 1) throw new Error('This base64 has an impossible length. Part of it is probably missing.')
      return new Uint8Array(Buffer.from(b, 'base64'))
    }
    case 'base32': {
      // RFC 4648 alphabet; TON (ADNL) writes it lowercase without padding.
      const b = s.replace(/\s/g, '').replace(/=+$/, '').toLowerCase()
      let bits = 0
      let value = 0
      const out: number[] = []
      for (const c of b) {
        const i = B32.indexOf(c)
        if (i < 0) throw new Error(`Base32 may only contain a-z and 2-7 (found "${c}").`)
        value = (value << 5) | i
        bits += 5
        if (bits >= 8) {
          out.push((value >>> (bits - 8)) & 255)
          bits -= 8
        }
      }
      return new Uint8Array(out)
    }
    case 'decimal': {
      const d = s.replace(/[\s_,]/g, '')
      if (!/^\d+$/.test(d)) throw new Error('Enter a non-negative whole number (digits only).')
      return bigintToBytes(BigInt(d))
    }
    case 'bytes': {
      const parts = s.replace(/^[[(]|[\])]$/g, '').split(/[\s,;]+/).filter(Boolean)
      return new Uint8Array(parts.map((p) => {
        const n = /^0x[0-9a-f]+$/i.test(p) ? Number.parseInt(p, 16) : /^\d+$/.test(p) ? Number(p) : Number.NaN
        if (!(n >= 0 && n <= 255)) throw new Error(`"${p}" is not a byte (0-255).`)
        return n
      }))
    }
  }
}

/** Encodes bytes in the given format. Returns null for 'utf8' when the bytes are not valid UTF-8. */
export function encodeBytes(bytes: Uint8Array, format: ByteFormat): string | null {
  const buf = Buffer.from(bytes)
  switch (format) {
    case 'utf8':
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      }
      catch {
        return null
      }
    case 'hex': return buf.toString('hex')
    case 'base64': return buf.toString('base64')
    case 'base64url': return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    case 'base32': {
      let bits = 0
      let value = 0
      let out = ''
      for (const byte of bytes) {
        value = (value << 8) | byte
        bits += 8
        while (bits >= 5) {
          out += B32[(value >>> (bits - 5)) & 31]
          bits -= 5
        }
      }
      if (bits > 0) out += B32[(value << (5 - bits)) & 31]
      return out
    }
    case 'decimal': return bytes.length ? BigInt(`0x${buf.toString('hex')}`).toString() : ''
    case 'bytes': return `[${Array.from(bytes).join(', ')}]`
  }
}

/** Big-endian, minimal length (0 -> one zero byte). */
export function bigintToBytes(n: bigint): Uint8Array {
  let h = n.toString(16)
  if (h.length % 2) h = `0${h}`
  return new Uint8Array(Buffer.from(h, 'hex'))
}

export const toHex = (b: Uint8Array) => encodeBytes(b, 'hex')!

/**
 * Parses a fixed-size binary value (key, signature) written as hex or base64/base64url.
 * Hex wins when the text is exactly `len * 2` hex digits.
 */
export function parseFixedBytes(input: string, len: number, what: string): Uint8Array {
  const s = input.trim().replace(/^0x/i, '').replace(/\s/g, '')
  if (!s) throw new Error(`Enter the ${what}.`)
  let bytes: Uint8Array
  if (/^[0-9a-f]*$/i.test(s) && s.length === len * 2) bytes = parseBytes(s, 'hex')
  else if (/^[0-9a-f]+$/i.test(s) && s.length > len) throw new Error(`The ${what} is ${len} bytes: ${len * 2} hex digits (got ${s.length}).`)
  else bytes = parseBytes(s, 'base64')
  if (bytes.length !== len) throw new Error(`The ${what} must be ${len} bytes (${len * 2} hex digits), got ${bytes.length} bytes.`)
  return bytes
}
