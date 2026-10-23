import { describe, expect, it } from 'vitest'
import { buildLinks, decodeBase64Url, encodeBase64Url, inspectParam, makeParam, parseLink } from './logic'

describe('buildLinks (examples from core.telegram.org/bots/webapps and /api/links)', () => {
  it('direct Mini App links', () => {
    expect(buildLinks({ kind: 'direct', bot: 'botusername', app: 'appname' }).https).toBe('https://t.me/botusername/appname')
    expect(buildLinks({ kind: 'direct', bot: 'botusername', app: 'appname', param: 'command' }).https).toBe('https://t.me/botusername/appname?startapp=command')
    const l = buildLinks({ kind: 'direct', bot: 'botusername', app: 'appname', param: 'command', mode: 'compact' })
    expect(l.https).toBe('https://t.me/botusername/appname?startapp=command&mode=compact')
    expect(l.tg).toBe('tg://resolve?domain=botusername&appname=appname&startapp=command&mode=compact')
    expect(l.errors).toEqual([])
  })
  it('main Mini App links', () => {
    expect(buildLinks({ kind: 'main', bot: 'botusername' }).https).toBe('https://t.me/botusername?startapp')
    expect(buildLinks({ kind: 'main', bot: 'botusername', param: 'command' }).https).toBe('https://t.me/botusername?startapp=command')
    expect(buildLinks({ kind: 'main', bot: 'botusername', param: 'command', mode: 'compact' }).https).toBe('https://t.me/botusername?startapp=command&mode=compact')
    expect(buildLinks({ kind: 'main', bot: 'botusername', param: 'command', mode: 'fullscreen' }).tg).toBe('tg://resolve?domain=botusername&startapp=command&mode=fullscreen')
  })
  it('attachment menu and /start links', () => {
    expect(buildLinks({ kind: 'attach', bot: 'botusername', param: 'command', choose: ['groups', 'channels'] }).https).toBe('https://t.me/botusername?startattach=command&choose=groups+channels')
    expect(buildLinks({ kind: 'attach', bot: 'botusername', choose: ['users', 'bots'] }).https).toBe('https://t.me/botusername?startattach&choose=users+bots')
    // bots/features#deep-linking example
    expect(buildLinks({ kind: 'start', bot: '@your_bot', param: 'spaceship' }).https).toBe('https://t.me/your_bot?start=spaceship')
  })
  it('validates input', () => {
    expect(buildLinks({ kind: 'direct', bot: 'botusername', app: 'x' }).errors).toHaveLength(1)
    expect(buildLinks({ kind: 'main', bot: 'botusername', param: 'a b' }).errors[0]).toMatch(/only contain/)
    expect(buildLinks({ kind: 'start', bot: 'botusername', param: 'a'.repeat(65) }).errors[0]).toMatch(/limit here is 64/)
    expect(buildLinks({ kind: 'main', bot: 'botusername', param: 'a'.repeat(512) }).errors).toEqual([])
    expect(buildLinks({ kind: 'main', bot: 'wallet' }).warnings[0]).toMatch(/end in "bot"/)
  })
})

describe('base64url', () => {
  it('matches RFC 4648 test vectors (section 10, url-safe alphabet, no padding)', () => {
    const v: [string, string][] = [['', ''], ['f', 'Zg'], ['fo', 'Zm8'], ['foo', 'Zm9v'], ['foob', 'Zm9vYg'], ['fooba', 'Zm9vYmE'], ['foobar', 'Zm9vYmFy']]
    for (const [plain, enc] of v) {
      expect(encodeBase64Url(plain)).toBe(enc)
      expect(decodeBase64Url(enc)).toBe(plain)
    }
  })
  it('round-trips unicode like @tma.js/bridge start-param tests', () => {
    const value = 'Привет, 世界! ✓ <>?'
    expect(encodeBase64Url(value)).toMatch(/^[\w-]*$/)
    expect(decodeBase64Url(encodeBase64Url(value))).toBe(value)
    expect(() => decodeBase64Url('%%%')).toThrow()
  })
  it('length limit vector from @tma.js/bridge: 400 × "a" encodes to 534 characters', () => {
    expect(makeParam('a'.repeat(400), 'text')).toHaveLength(534)
    expect(makeParam('a'.repeat(384), 'text').length).toBeLessThanOrEqual(512)
    expect(makeParam('a'.repeat(385), 'text').length).toBeGreaterThan(512)
  })
  it('minifies JSON before encoding', () => {
    expect(makeParam('{ "ref": 42 }', 'json')).toBe(encodeBase64Url('{"ref":42}'))
    expect(() => makeParam('{bad', 'json')).toThrow()
  })
})

describe('parseLink / inspectParam', () => {
  it('reads t.me and tg:// links', () => {
    expect(parseLink('https://t.me/botusername/appname?startapp=command&mode=compact')).toEqual({ bot: 'botusername', app: 'appname', kind: 'direct', param: 'command', mode: 'compact' })
    expect(parseLink('t.me/botusername?startapp')).toEqual({ bot: 'botusername', app: undefined, kind: 'main', param: undefined, mode: undefined })
    expect(parseLink('tg://resolve?domain=botusername&appname=appname&startapp=command')).toMatchObject({ bot: 'botusername', app: 'appname', kind: 'direct', param: 'command' })
    expect(parseLink('https://t.me/your_bot?start=spaceship')).toMatchObject({ kind: 'start', param: 'spaceship' })
    expect(parseLink('command')).toBeNull()
  })
  it('decodes base64url JSON parameters', () => {
    expect(inspectParam(encodeBase64Url('{"ref":42}'))).toEqual({ text: '{"ref":42}', json: { ref: 42 } })
    expect(inspectParam('Zm9vYmFy')).toEqual({ text: 'foobar', json: undefined })
    expect(inspectParam('a').text).toBeNull()
  })
})
