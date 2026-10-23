// Telegram bot / Mini App deep links, https://core.telegram.org/api/links and https://core.telegram.org/bots/webapps

export type LinkKind = 'main' | 'direct' | 'start' | 'attach'
export type Mode = '' | 'compact' | 'fullscreen'
export type ChatType = 'users' | 'bots' | 'groups' | 'channels'

export const LINK_KINDS: { value: LinkKind, label: string, hint: string }[] = [
  { value: 'direct', label: 'Direct Mini App link', hint: 't.me/<bot>/<app>?startapp=… opens a named Mini App in any chat.' },
  { value: 'main', label: 'Main Mini App', hint: 't.me/<bot>?startapp=… opens the bot\'s main Mini App (set in @BotFather).' },
  { value: 'start', label: 'Bot chat (/start)', hint: 't.me/<bot>?start=… opens the chat and sends /start with the parameter.' },
  { value: 'attach', label: 'Attachment menu', hint: 't.me/<bot>?startattach=… installs or opens the bot in the attachment menu.' }
]

/** start: 64 chars (bots/features#deep-linking). startapp / startattach: 512 (docs.telegram-mini-apps.com/platform/start-parameter). */
export const paramLimit = (kind: LinkKind) => (kind === 'start' ? 64 : 512)
const PARAM_RE = /^[\w-]*$/

export function encodeBase64Url(value: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(value)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Throws when the value is not base64url or not UTF-8. */
export function decodeBase64Url(value: string): string {
  if (!/^[\w-]*$/.test(value) || value.length % 4 === 1) throw new Error('Not base64url')
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

export type PayloadFormat = 'raw' | 'text' | 'json'

/** Turns user input into a start parameter. raw = used as is; text/json = base64url of UTF-8 (JSON minified first). */
export function makeParam(input: string, format: PayloadFormat): string {
  if (format === 'raw') return input.trim()
  if (format === 'json') return encodeBase64Url(JSON.stringify(JSON.parse(input)))
  return encodeBase64Url(input)
}

export interface LinkInput {
  kind: LinkKind
  bot: string
  app?: string
  param?: string
  mode?: Mode
  choose?: ChatType[]
}

export interface BuiltLinks {
  https: string
  tg: string
  errors: string[]
  warnings: string[]
}

export function buildLinks(i: LinkInput): BuiltLinks {
  const errors: string[] = []
  const warnings: string[] = []
  const bot = i.bot.trim().replace(/^@/, '').replace(/^(https?:\/\/)?t\.me\//i, '')
  const app = (i.app ?? '').trim()
  const param = (i.param ?? '').trim()

  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bot)) errors.push('Bot username: 4–32 letters, digits or underscores, starting with a letter.')
  else if (!/bot$/i.test(bot)) warnings.push('Bot usernames normally end in "bot". Double-check it is the bot, not a user or channel.')
  if (i.kind === 'direct' && !/^[A-Za-z0-9_]{3,30}$/.test(app)) errors.push('Mini App short name: 3–30 letters, digits or underscores (as set in @BotFather /newapp).')
  if (!PARAM_RE.test(param)) errors.push('The parameter may only contain A–Z, a–z, 0–9, _ and -. Encode other content as base64url.')
  if (param.length > paramLimit(i.kind)) errors.push(`The parameter is ${param.length} characters; the limit here is ${paramLimit(i.kind)}.`)

  const q: string[] = []
  if (i.kind === 'main') q.push(param ? `startapp=${param}` : 'startapp')
  if (i.kind === 'direct' && param) q.push(`startapp=${param}`)
  if (i.kind === 'start') q.push(`start=${param}`)
  if (i.kind === 'attach') {
    q.push(param ? `startattach=${param}` : 'startattach')
    if (i.choose?.length) q.push(`choose=${i.choose.join('+')}`)
  }
  if ((i.kind === 'main' || i.kind === 'direct') && i.mode) q.push(`mode=${i.mode}`)
  if (i.kind === 'start' && !param) warnings.push('Without a parameter this is a plain bot link.')

  const path = i.kind === 'direct' ? `${bot}/${app}` : bot
  const https = `https://t.me/${path}${q.length ? `?${q.join('&')}` : ''}`
  const tg = `tg://resolve?${[`domain=${bot}`, ...(i.kind === 'direct' ? [`appname=${app}`] : []), ...q].join('&')}`
  return { https, tg, errors, warnings }
}

export interface ParsedLink {
  bot: string
  app?: string
  kind: LinkKind | 'other'
  param?: string
  mode?: string
}

/** Reads a t.me / tg://resolve link, or treats the input as a bare start parameter (returns null). */
export function parseLink(input: string): ParsedLink | null {
  const s = input.trim()
  let url: URL
  try {
    url = new URL(/^t\.me\//i.test(s) ? `https://${s}` : s)
  }
  catch {
    return null
  }
  const p = url.searchParams
  let bot: string, app: string | undefined
  if (url.protocol === 'tg:') {
    // tg://resolve?domain=…: URL parses "resolve" as the host
    bot = p.get('domain') ?? ''
    app = p.get('appname') ?? undefined
  }
  else if (/^(www\.)?(t|telegram)\.me$/i.test(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean)
    bot = parts[0] ?? ''
    app = parts[1]
  }
  else return null
  if (!bot) return null
  const kind: ParsedLink['kind'] = p.has('startapp') ? (app ? 'direct' : 'main') : p.has('startattach') ? 'attach' : p.has('start') ? 'start' : app ? 'direct' : 'other'
  const param = p.get('startapp') ?? p.get('startattach') ?? p.get('start') ?? undefined
  return { bot, app, kind, param: param || undefined, mode: p.get('mode') ?? undefined }
}

/** Decodes a start parameter if it is base64url of UTF-8 text; JSON is parsed too. */
export function inspectParam(param: string): { text: string | null, json: unknown } {
  let text: string | null = null
  try {
    text = decodeBase64Url(param)
    if (/[\u0000-\u0008\u000E-\u001F]/.test(text)) text = null // binary, not text
  }
  catch { /* not base64url */ }
  let json: unknown
  if (text !== null) {
    try {
      json = JSON.parse(text)
    }
    catch { /* plain text */ }
  }
  return { text, json }
}
