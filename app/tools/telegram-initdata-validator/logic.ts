import { signVerify } from '@ton/crypto'

// Telegram Mini App initData checks, https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Everything runs locally: the bot token never leaves the browser.

/** Telegram's Ed25519 keys for third-party validation (same page, "Validating data for Third-Party Use"). */
export const TELEGRAM_PUBLIC_KEYS = {
  production: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
  test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec'
} as const
export type TelegramEnv = keyof typeof TELEGRAM_PUBLIC_KEYS

/**
 * Accepts the raw initData query string, or a whole Mini App URL / launch hash containing `tgWebAppData=…`
 * (where initData is URL-encoded once more).
 */
export function normalizeInitData(input: string): string {
  const s = input.trim()
  const m = s.match(/[#?&]?tgWebAppData=([^&#]*)/)
  if (m) {
    try {
      return decodeURIComponent(m[1]!)
    }
    catch {
      return m[1]! // malformed %-escape: show it as is, the checks will fail
    }
  }
  return s.replace(/^[?#]/, '')
}

const pairsOf = (raw: string) => [...new URLSearchParams(raw)]

/** Sorted "key=value" lines joined by "\n", skipping `exclude` keys. Values are URL-decoded. */
export function dataCheckString(raw: string, exclude: string[] = ['hash']): string {
  return pairsOf(raw).filter(([k]) => !exclude.includes(k)).map(([k, v]) => `${k}=${v}`).sort().join('\n')
}

/** "123456:AA…" → 123456, or null when it does not look like a bot token. */
export function botIdFromToken(token: string): number | null {
  const m = token.trim().match(/^(\d{5,20}):[\w-]{30,}$/)
  return m ? Number(m[1]) : null
}

const enc = new TextEncoder()
async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

export interface HashCheck { ok: boolean, expected: string, received: string | null }

/** hash = hex(HMAC_SHA256(key = HMAC_SHA256(key = "WebAppData", botToken), data_check_string)). */
export async function checkHash(raw: string, botToken: string): Promise<HashCheck> {
  const secret = await hmac(enc.encode('WebAppData'), botToken.trim())
  const expected = hex(await hmac(secret, dataCheckString(raw, ['hash'])))
  const received = new URLSearchParams(raw).get('hash')
  return { ok: !!received && received.toLowerCase() === expected, expected, received }
}

/** Ed25519 `signature` (base64url) over "<bot_id>:WebAppData\n" + data_check_string without hash and signature. */
export function checkSignature(raw: string, botId: number, env: TelegramEnv = 'production'): { ok: boolean, present: boolean } {
  const sig = new URLSearchParams(raw).get('signature')
  if (!sig) return { ok: false, present: false }
  const bytes = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (bytes.length !== 64) return { ok: false, present: true }
  const message = Buffer.from(`${botId}:WebAppData\n${dataCheckString(raw, ['hash', 'signature'])}`)
  return { ok: signVerify(message, bytes, Buffer.from(TELEGRAM_PUBLIC_KEYS[env], 'hex')), present: true }
}

export interface InitDataFields {
  authDate: number | null
  /** JSON fields (user, receiver, chat) parsed; other fields as strings. */
  values: Record<string, unknown>
}

export function parseFields(raw: string): InitDataFields {
  const values: Record<string, unknown> = {}
  for (const [k, v] of pairsOf(raw)) {
    if (['user', 'receiver', 'chat'].includes(k)) {
      try {
        values[k] = JSON.parse(v)
        continue
      }
      catch { /* keep as text */ }
    }
    values[k] = v
  }
  const a = Number(values.auth_date)
  return { authDate: Number.isInteger(a) && a > 0 ? a : null, values }
}

/** Seconds since auth_date (negative = in the future). */
export const ageSeconds = (authDate: number, nowMs = Date.now()) => Math.floor(nowMs / 1000) - authDate
