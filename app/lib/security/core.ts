// Shared, pure helpers for the security tools (scam checker, safe-to-send, poisoning detector, token safety,
// wallet checkup). Imports @ton/core: use from Tool.vue / logic.ts only (client + vitest).
import { Address } from '@ton/core'
import type { TaAccount, TaEvent } from '~/lib/tx-user/events'
import { COIN_NAME } from '~/utils/currency'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'

// ---------------------------------------------------------------- checks

export type Level = 'danger' | 'warn' | 'ok' | 'info'

export interface Check {
  level: Level
  title: string
  detail?: string
  /** Tool that fixes or explains it: `/tools/<slug>`. */
  link?: { to: string, label: string }
}

const RANK: Record<Level, number> = { danger: 3, warn: 2, info: 1, ok: 0 }

/** Worst level in a list ('ok' when empty). */
export function worst(checks: Check[]): Level {
  return checks.reduce<Level>((w, c) => (RANK[c.level] > RANK[w] ? c.level : w), 'ok')
}

/** Most severe first, stable inside a level. */
export function sortChecks(checks: Check[]): Check[] {
  return [...checks].sort((a, b) => RANK[b.level] - RANK[a.level])
}

// ---------------------------------------------------------------- addresses

/** Lowercase raw "0:abc…", or null when it does not parse. */
export function rawOf(address: string): string | null {
  try {
    return Address.parse(address.trim()).toRawString().toLowerCase()
  }
  catch {
    return null
  }
}

/** UQ… for wallets / anything not deployed, EQ… for contracts. */
export function friendlyOf(raw: string, { bounceable = false, testnet = false } = {}): string {
  return Address.parse(raw).toString({ bounceable, testOnly: testnet, urlSafe: true })
}

export const ZERO_RAWS = [`0:${'0'.repeat(64)}`, `-1:${'0'.repeat(64)}`]

// ---------------------------------------------------------------- scam text

const LINK = /https?:\/\/|\bt\.me\/|\b[a-z0-9-]{2,}\s?\.\s?(?:com|org|net|io|xyz|app|site|online|pro|top|fun|cc|life|me|info|gift|club|vip|live|link|click|shop|ru|to|gg|bot)\b/i
const BOT = /@\w+bot\b/i
const BAIT = /\b(?:claim|airdrop|unlock|voucher|giveaway|redeem|reward|bonus|you(?:'|’)ve received|you have received|free (?:gram|ton|usdt))\b/i

/** Why a name, symbol, description or comment looks like scam bait, or null. */
export function scamTextReason(text: string | undefined | null): string | null {
  if (!text) return null
  if (LINK.test(text)) return 'contains a website or Telegram link'
  if (BOT.test(text)) return 'advertises a Telegram bot'
  if (BAIT.test(text)) return 'uses “claim / airdrop / reward” bait wording'
  return null
}

// ---------------------------------------------------------------- token impersonation

const norm = (s: string) => s.toUpperCase().replace(/₮/g, 'T').replace(/[^A-Z0-9]/g, '')

/** The native coin has no jetton master: any token calling itself this is a fake. */
const COIN_NAMES = ['GRAM', 'TON', 'TONCOIN']

/**
 * A token whose symbol is that of a well-known jetton (or the native coin) but whose master address is
 * different. Returns the name it copies, or null.
 */
export function impersonates(symbol: string | undefined, masterRaw: string): string | null {
  if (!symbol) return null
  const s = norm(symbol)
  if (COIN_NAMES.includes(s)) return `${COIN_NAME} (the native coin, which is not a token)`
  const k = KNOWN_JETTONS.find(j => norm(j.symbol) === s)
  return k && rawOf(k.master) !== masterRaw.toLowerCase() ? `${k.name} (${k.symbol})` : null
}

/** tonapi `verification` (jettons) / `trust` (NFTs) as a check. */
export function trustCheck(v: string | undefined, what: string): Check {
  if (v === 'blacklist') return { level: 'danger', title: `${what} is on the tonapi / Tonkeeper scam list`, detail: 'Do not buy it, open its links or send anything to claim it. Hide it in your wallet.' }
  if (v === 'whitelist') return { level: 'ok', title: `${what} is verified by tonapi / Tonkeeper` }
  if (v === 'graylist') return { level: 'warn', title: `${what} is graylisted by tonapi`, detail: 'Reported as suspicious but not confirmed as a scam.' }
  return { level: 'info', title: `${what} is not verified`, detail: 'Not reviewed by tonapi. Anyone can create a token or NFT with any name and logo.' }
}

// ---------------------------------------------------------------- tonapi events -> counterparties

/** Incoming GRAM below this (0.01) carries no real value: spam, poisoning or a probe. */
export const DUST_NANO = 10_000_000n

export interface Counterparty {
  raw: string
  name?: string
  isWallet?: boolean
  flaggedScam: boolean
  /** Value transfers the viewer sent to it / received from it (not dust, not spam). */
  sent: number
  received: number
  /** Dust or spam transfers it sent to the viewer. */
  junkIn: number
  /** Events tonapi marks as scam. */
  scamEvents: number
  comments: string[]
  lastSeen: number
}

interface Transfer { from: TaAccount, to: TaAccount, junk: boolean, comment?: string, ts: number, scam: boolean }

function big(v: unknown): bigint {
  try {
    return BigInt(v as string | number)
  }
  catch {
    return 0n
  }
}

/** GRAM / jetton / NFT transfers in tonapi events, each marked junk (dust or spam) or not. */
function transfers(events: TaEvent[]): Transfer[] {
  const out: Transfer[] = []
  for (const e of events) {
    // A bounce shows up as a TonTransfer back to the sender inside the same event (e.g. an uninit wallet
    // returning a bounceable transfer). It is not a transfer anyone chose to make: skip it.
    const tonSent = new Set<string>()
    for (const a of e.actions) {
      const p = a[a.type] as { sender?: TaAccount, recipient?: TaAccount, amount?: unknown, comment?: string, jetton?: { decimals?: number, verification?: string } } | undefined
      if (!p?.sender || !p.recipient || a.status !== 'ok') continue
      if (a.type === 'TonTransfer') {
        const from = p.sender.address.toLowerCase()
        const to = p.recipient.address.toLowerCase()
        if (tonSent.has(`${to}>${from}`)) continue
        tonSent.add(`${from}>${to}`)
      }
      let junk = !!e.is_scam
      if (a.type === 'TonTransfer') junk ||= big(p.amount) < DUST_NANO
      else if (a.type === 'JettonTransfer') {
        const dec = p.jetton?.decimals ?? 9
        junk ||= p.jetton?.verification === 'blacklist' || big(p.amount) * 100n < 10n ** BigInt(dec)
      }
      else if (a.type !== 'NftItemTransfer') continue
      out.push({ from: p.sender, to: p.recipient, junk, comment: p.comment, ts: e.timestamp, scam: !!e.is_scam })
    }
  }
  return out
}

/** Everyone the viewer exchanged GRAM, jettons or NFTs with, keyed by lowercase raw address. */
export function counterparties(events: TaEvent[], viewer: string): Map<string, Counterparty> {
  const me = viewer.toLowerCase()
  const map = new Map<string, Counterparty>()
  for (const t of transfers(events)) {
    const from = t.from.address.toLowerCase()
    const to = t.to.address.toLowerCase()
    const out = from === me
    if (from === to || (!out && to !== me)) continue
    const other = out ? t.to : t.from
    const raw = out ? to : from
    const c = map.get(raw) ?? { raw, name: other.name, isWallet: other.is_wallet, flaggedScam: !!other.is_scam, sent: 0, received: 0, junkIn: 0, scamEvents: 0, comments: [], lastSeen: 0 }
    if (out && !t.junk) c.sent++
    else if (!out && t.junk) c.junkIn++
    else if (!out) c.received++
    if (t.scam) c.scamEvents++
    if (!out && t.comment && c.comments.length < 3 && !c.comments.includes(t.comment)) c.comments.push(t.comment)
    c.lastSeen = Math.max(c.lastSeen, t.ts)
    map.set(raw, c)
  }
  return map
}

// ---------------------------------------------------------------- look-alikes

export interface VisibleMatch {
  bounceable: boolean
  /** Equal characters after the 2-letter tag (UQ/EQ) … */
  prefix: number
  /** … and at the end. */
  suffix: number
}

/**
 * How much two addresses look alike in the form a wallet shows (same bounce flag for both: the last
 * 4 characters hold a checksum, so EQ and UQ forms of one address end differently). Poisoners grind
 * addresses whose ending (the part wallets show after "…") matches a real counterparty.
 * Returns the stronger of the two forms, or null when they do not look alike.
 */
export function visibleMatch(a: string, b: string, testnet = false): VisibleMatch | null {
  const A = Address.parse(a)
  const B = Address.parse(b)
  if (A.equals(B)) return null
  let best: VisibleMatch | null = null
  for (const bounceable of [false, true]) {
    const x = A.toString({ bounceable, testOnly: testnet, urlSafe: true })
    const y = B.toString({ bounceable, testOnly: testnet, urlSafe: true })
    let prefix = 0
    while (prefix < 44 && x[2 + prefix] === y[2 + prefix]) prefix++
    let suffix = 0
    while (suffix < 44 && x[x.length - 1 - suffix] === y[y.length - 1 - suffix]) suffix++
    if (!best || prefix + suffix > best.prefix + best.suffix) best = { bounceable, prefix, suffix }
  }
  // Random pairs share 3 trailing characters 1 time in 262 144: this is a deliberate match.
  return best && (best.suffix >= 3 || (best.prefix >= 3 && best.suffix >= 2) || best.prefix >= 5) ? best : null
}

export interface Fake { cp: Counterparty, match: VisibleMatch }
export interface LookalikeGroup { real: Counterparty, fakes: Fake[] }

export interface PoisonReport {
  events: number
  /** Oldest / newest event timestamp scanned. */
  from: number
  to: number
  groups: LookalikeGroup[]
  /** Accounts that only ever sent dust or spam (and look like nobody you deal with). */
  junkSenders: Counterparty[]
  scamEvents: number
}

/**
 * Real counterparties = ones you sent value to or got value from. A fake = an account that only sent you
 * dust or spam and whose visible address matches a real one. Fakes are listed under the real address.
 */
export function detectPoisoning(events: TaEvent[], viewer: string, testnet = false): PoisonReport {
  const cps = [...counterparties(events, viewer).values()]
  const real = cps.filter(c => c.sent > 0 || c.received > 0)
  const suspects = cps.filter(c => c.sent === 0 && c.received === 0 && c.junkIn > 0)
  const groups = new Map<string, LookalikeGroup>()
  const faked = new Set<string>()
  for (const s of suspects) {
    let best: { r: Counterparty, m: VisibleMatch } | null = null
    for (const r of real) {
      const m = visibleMatch(s.raw, r.raw, testnet)
      if (m && (!best || m.prefix + m.suffix > best.m.prefix + best.m.suffix)) best = { r, m }
    }
    if (!best) continue
    faked.add(s.raw)
    const g = groups.get(best.r.raw) ?? { real: best.r, fakes: [] }
    g.fakes.push({ cp: s, match: best.m })
    groups.set(best.r.raw, g)
  }
  const ts = events.map(e => e.timestamp)
  return {
    events: events.length,
    from: ts.length ? Math.min(...ts) : 0,
    to: ts.length ? Math.max(...ts) : 0,
    groups: [...groups.values()].sort((a, b) => b.fakes.length - a.fakes.length),
    junkSenders: suspects.filter(s => !faked.has(s.raw)).sort((a, b) => b.junkIn - a.junkIn),
    scamEvents: events.filter(e => e.is_scam).length
  }
}

type Get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

/** An account's tonapi events, newest first, 100 per page (the keyless cap), up to `max`. */
export async function fetchEvents(get: Get, account: string, max = 100, onPage?: (n: number) => void): Promise<{ events: TaEvent[], more: boolean }> {
  const events: TaEvent[] = []
  let before: number | undefined
  while (events.length < max) {
    const limit = Math.min(100, max - events.length)
    const r = await get<{ events: TaEvent[], next_from?: number }>(`accounts/${encodeURIComponent(account)}/events`, { limit, before_lt: before })
    events.push(...r.events)
    onPage?.(events.length)
    if (r.events.length < limit || !r.next_from) return { events, more: false }
    before = r.next_from
  }
  return { events, more: true }
}

// ---------------------------------------------------------------- is this account a spammer / poisoner?

export interface SenderProfile {
  /** Dust / spam transfers this account sent to others. */
  junkOut: number
  /** Real transfers it sent. */
  realOut: number
  recipients: number
  scamEvents: number
  baitComment: string | null
}

/** What an account does with its outgoing transfers, from its own recent tonapi events. */
export function senderProfile(events: TaEvent[], account: string): SenderProfile {
  const me = account.toLowerCase()
  const to = new Set<string>()
  let junkOut = 0
  let realOut = 0
  let baitComment: string | null = null
  for (const t of transfers(events)) {
    if (t.from.address.toLowerCase() !== me || t.to.address.toLowerCase() === me) continue
    to.add(t.to.address.toLowerCase())
    if (t.junk) junkOut++
    else realOut++
    if (!baitComment && t.comment && scamTextReason(t.comment)) baitComment = t.comment
  }
  return { junkOut, realOut, recipients: to.size, scamEvents: events.filter(e => e.is_scam).length, baitComment }
}

/** Sends nothing but dust/spam to several people: the signature of a poisoning or spam sender. */
export function isSpamSender(p: SenderProfile): boolean {
  return p.junkOut >= 3 && p.realOut === 0
}

// ---------------------------------------------------------------- tonkeeper/ton-assets labels

export const LABELS_URL = 'https://raw.githubusercontent.com/tonkeeper/ton-assets/main/accounts.json'
export interface Label { name: string, memo: boolean }
let labels: Promise<Map<string, Label>> | null = null

/** Known names (exchanges, services, system contracts) from Tonkeeper's public ton-assets list, keyed by lowercase raw. */
export function loadLabels(fetchFn: typeof fetch = fetch): Promise<Map<string, Label>> {
  labels ??= fetchFn(LABELS_URL)
    .then(r => (r.ok ? r.json() as Promise<{ address: string, name: string, require_memo?: boolean }[]> : []))
    .then(list => new Map(list.map(x => [x.address.toLowerCase(), { name: x.name, memo: !!x.require_memo }])))
    .catch(() => {
      labels = null
      return new Map<string, Label>()
    })
  return labels
}
