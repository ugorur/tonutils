import { ADNLAddress } from '@ton/core'

export interface AdnlConversion {
  /** 64 lowercase hex characters (the form in DNS records and node configs). */
  hex: string
  /** 55-character base32 user form, as used in `<adnl>.adnl` TON Site hosts. */
  friendly: string
  /** Standard base64 of the 32 bytes (toncenter returns DNS site records this way). */
  base64: string
  /** TON Site URL for rldp-http-proxy / TON-enabled browsers. */
  siteUrl: string
  input: 'hex' | 'friendly' | 'base64'
}

function convert(bytes: Uint8Array, input: AdnlConversion['input']): AdnlConversion {
  const a = new ADNLAddress(Buffer.from(bytes))
  const friendly = a.toString()
  return {
    hex: a.address.toString('hex'),
    friendly,
    base64: a.address.toString('base64'),
    siteUrl: `http://${friendly}.adnl/`,
    input
  }
}

/** Accepts hex (64), base32 user form (55, optionally inside an http://….adnl/ URL) or base64 (44). */
export function convertAdnl(value: string): AdnlConversion {
  let s = value.trim()
  if (!s) throw new Error('Enter an ADNL address')
  // Strip a TON Site URL or a bare host: http://<55 chars>.adnl/path
  const host = /^(?:https?:\/\/)?([a-z2-7]{55})\.adnl(?:[/:?#].*)?$/i.exec(s)
  if (host) s = host[1]!
  s = s.replace(/^0x/i, '')

  if (/^[0-9a-f]{64}$/i.test(s)) return convert(Buffer.from(s, 'hex'), 'hex')
  if (/^[a-z2-7]{55}$/i.test(s)) {
    let a: ADNLAddress
    try {
      a = ADNLAddress.parseFriendly(s.toLowerCase())
    }
    catch {
      throw new Error('This 55-character ADNL address has a wrong checksum or prefix. Check for a typo.')
    }
    return convert(a.address, 'friendly')
  }
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) {
    const bytes = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (bytes.length === 32) return convert(bytes, 'base64')
  }
  throw new Error('Not an ADNL address. Expected 64 hex characters, the 55-character .adnl form, or 32 bytes in base64.')
}
