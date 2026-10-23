// Turns whatever a user pastes (tx hash, message hash, explorer link) into a 64-char hex hash.
// Pure TS, no @ton/*.
import { txHashHex } from '~/utils/ton/explorers'

const HEX64 = /^(?:0x)?[0-9a-f]{64}$/i
const B64_32 = /^[A-Za-z0-9+/_-]{43}=?$/

function tokenToHex(token: string): string | null {
  const t = token.trim()
  if (HEX64.test(t)) return t.replace(/^0x/i, '').toLowerCase()
  if (!B64_32.test(t)) return null
  try {
    const hex = txHashHex(t)
    return /^[0-9a-f]{64}$/.test(hex) ? hex : null
  }
  catch {
    return null
  }
}

/**
 * Accepts hex (with or without 0x), base64 / base64url, or a Tonviewer / Tonscan / tonscan.com /
 * toncenter link that contains a hash. Returns lowercase hex. Throws Error with a readable message.
 */
export function parseTxInput(input: string): string {
  const s = input.trim()
  if (!s) throw new Error('Paste a transaction hash, message hash or explorer link.')

  const direct = tokenToHex(s)
  if (direct) return direct

  if (/^https?:\/\/|^[\w.-]+\.\w+\//i.test(s)) {
    let url: URL
    try {
      url = new URL(/^https?:/i.test(s) ? s : `https://${s}`)
    }
    catch {
      throw new Error('That link could not be read. Paste the hash itself instead.')
    }
    const parts = [...url.pathname.split('/'), ...url.searchParams.values(), url.hash.replace(/^#/, '')]
    for (const p of parts) {
      let seg = p
      try {
        seg = decodeURIComponent(p)
      }
      catch { /* keep raw */ }
      const hex = tokenToHex(seg)
      if (hex) return hex
    }
    throw new Error('No transaction hash found in that link.')
  }

  throw new Error('Not a hash. Expected 64 hex characters or a 44-character base64 hash (or an explorer link).')
}
