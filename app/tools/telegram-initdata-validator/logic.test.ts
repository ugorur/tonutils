import { describe, expect, it } from 'vitest'
import { ageSeconds, botIdFromToken, checkHash, checkSignature, dataCheckString, normalizeInitData, parseFields } from './logic'

// Real init data signed by Telegram for a public test bot, from the @tma.js init-data test fixtures:
// https://github.com/Telegram-Mini-Apps/telegram-apps/blob/master/packages/init-data/test/fixtures.ts
// It carries both the bot-token `hash` and Telegram's Ed25519 `signature`.
const INIT_DATA = 'user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%20%2B%20-%20%3F%20%5C%2F%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2F4FPEE4tmP3ATHa57u6MqTDih13LTOiMoKoLDRG4PnSA.svg%22%7D&chat_instance=8134722200314281151&chat_type=private&auth_date=1733584787&signature=zL-ucjNyREiHDE8aihFwpfR9aggP2xiAo3NSpfe-p7IbCisNlDKlo7Kb6G4D0Ao2mBrSgEk4maLSdv6MLIlADQ&hash=2174df5b000556d044f3f020384e879c8efcab55ddea2ced4eb752e93e7080d6'
const BOT_ID = 7342037359
const BOT_TOKEN = `${BOT_ID}:AAFZehRPBRs8Seg40oDjTMIW8uTGPuW1zfQ`

const withParam = (k: string, v: string) => {
  const q = new URLSearchParams(INIT_DATA)
  q.set(k, v)
  return q.toString()
}

describe('bot token hash (HMAC-SHA256)', () => {
  it('accepts the Telegram-signed data', async () => {
    const r = await checkHash(INIT_DATA, BOT_TOKEN)
    expect(r.ok).toBe(true)
    expect(r.expected).toBe('2174df5b000556d044f3f020384e879c8efcab55ddea2ced4eb752e93e7080d6')
  })
  it('rejects a wrong token or changed data', async () => {
    expect((await checkHash(INIT_DATA, `${BOT_TOKEN}A`)).ok).toBe(false)
    expect((await checkHash(withParam('chat_type', 'group'), BOT_TOKEN)).ok).toBe(false)
    expect((await checkHash('auth_date=1', BOT_TOKEN)).received).toBeNull()
  })
})

describe('third-party Ed25519 signature', () => {
  it('accepts the Telegram-signed data with the production key', () => {
    expect(checkSignature(INIT_DATA, BOT_ID)).toEqual({ ok: true, present: true })
  })
  it('rejects a wrong bot id, the test key, changed data or a broken signature', () => {
    expect(checkSignature(INIT_DATA, BOT_ID + 1).ok).toBe(false)
    expect(checkSignature(INIT_DATA, BOT_ID, 'test').ok).toBe(false)
    expect(checkSignature(withParam('chat_type', 'group'), BOT_ID).ok).toBe(false)
    expect(checkSignature(withParam('signature', '!'), BOT_ID)).toEqual({ ok: false, present: true })
    expect(checkSignature('auth_date=1', BOT_ID)).toEqual({ ok: false, present: false })
  })
  it('ignores hash in the signed string', () => {
    expect(checkSignature(withParam('hash', 'other'), BOT_ID).ok).toBe(true)
  })
})

describe('parsing', () => {
  it('builds the data-check-string from decoded, sorted pairs', () => {
    const s = dataCheckString(INIT_DATA, ['hash', 'signature'])
    expect(s.split('\n').map(l => l.split('=')[0])).toEqual(['auth_date', 'chat_instance', 'chat_type', 'user'])
    expect(s).toContain('"first_name":"Vladislav + - ? \\/"')
  })
  it('extracts initData from a launch URL', () => {
    const url = `https://example.com/app#tgWebAppData=${encodeURIComponent(INIT_DATA)}&tgWebAppVersion=8.0&tgWebAppPlatform=tdesktop`
    expect(normalizeInitData(url)).toBe(INIT_DATA)
    expect(normalizeInitData(`?${INIT_DATA}`)).toBe(INIT_DATA)
    expect(normalizeInitData('#tgWebAppData=%E0%A4%A&tgWebAppVersion=8')).toBe('%E0%A4%A') // malformed escape must not throw
  })
  it('parses fields', () => {
    const f = parseFields(INIT_DATA)
    expect(f.authDate).toBe(1733584787)
    expect(f.values.user).toMatchObject({ id: 279058397, username: 'vdkfrost', is_premium: true })
    expect(f.values.chat_type).toBe('private')
    expect(ageSeconds(1733584787, 1733584787_000 + 90_000)).toBe(90)
  })
  it('reads the bot id from a token', () => {
    expect(botIdFromToken(BOT_TOKEN)).toBe(BOT_ID)
    expect(botIdFromToken('hello')).toBeNull()
  })
})
