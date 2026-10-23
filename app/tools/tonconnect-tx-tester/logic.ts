// TonConnect sendTransaction / signMessage request validator. Rules: ton-blockchain/ton-connect spec/rpc.md
// (sendTransaction, structured items), wallets-list.md (features), TEP-2 (address flags). Output is the
// @tonconnect/sdk 5 request shape (camelCase). Imports @ton/core: client / logic only.
import { Address, Cell } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { FeatureSummary } from '~/lib/dev-tonconnect/features'
import { COIN_SYMBOL, NANO_PER_COIN } from '~/utils/currency'
import { commentBody } from '~/utils/ton/messages'

export type Net = 'mainnet' | 'testnet'
export const CHAIN: Record<Net, string> = { mainnet: '-239', testnet: '-3' }

export type Level = 'error' | 'warn' | 'info' | 'ok'
export interface Check { level: Level, title: string, detail?: string }

export interface SdkMessage { address: string, amount: string, payload?: string, stateInit?: string, extraCurrency?: Record<string, string> }
export type SdkItem =
  | { type: 'ton', address: string, amount: string, payload?: string, stateInit?: string, extraCurrency?: Record<string, string> }
  | { type: 'jetton', master: string, destination: string, amount: string, [k: string]: unknown }
  | { type: 'nft', nftAddress: string, newOwner: string, [k: string]: unknown }

export interface SdkRequest {
  validUntil: number
  network: string
  from?: string
  messages?: SdkMessage[]
  items?: SdkItem[]
}

export interface Context {
  network: Net
  nowSec: number
  /** Connected wallet (raw 0:…), if any. */
  wallet?: string
  /** Connected wallet's runtime features, if any. */
  features?: FeatureSummary
  /** signMessage instead of sendTransaction: checks against the SignMessage feature. */
  signOnly?: boolean
}

export interface Validated { request: SdkRequest | null, checks: Check[], total: bigint }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const DECIMAL = /^\d+$/

/** Parses friendly (EQ/UQ/kQ/0Q) or raw; returns null when invalid. */
function addr(s: unknown): { address: Address, raw: boolean, testOnly: boolean, bounceable: boolean } | null {
  if (typeof s !== 'string') return null
  const v = s.trim()
  try {
    if (Address.isRaw(v)) return { address: Address.parseRaw(v), raw: true, testOnly: false, bounceable: true }
    const f = Address.parseFriendly(v)
    return { address: f.address, raw: false, testOnly: f.isTestOnly, bounceable: f.isBounceable }
  }
  catch {
    return null
  }
}

function boc(v: unknown): string | null {
  if (typeof v !== 'string') return 'must be a base64 string'
  try {
    const cells = Cell.fromBoc(Buffer.from(v, 'base64'))
    return cells.length === 1 ? null : `must hold exactly one root cell (has ${cells.length})`
  }
  catch (e) {
    return `is not a valid BOC (${(e as Error).message})`
  }
}

/**
 * Accepts: the SDK object (validUntil, messages[].extraCurrency), the wire payload (valid_until, extra_currency),
 * or the whole RPC envelope {"method":"sendTransaction","params":["<json>"]} from the spec.
 */
export function unwrap(text: string): unknown {
  let v: unknown = JSON.parse(text)
  if (isObj(v) && Array.isArray(v.params) && typeof v.params[0] === 'string' && typeof v.method === 'string') v = JSON.parse(v.params[0])
  return v
}

function checkDestination(where: string, raw: unknown, ctx: Context, c: Check[]): string | null {
  const a = addr(raw)
  if (!a) {
    c.push({ level: 'error', title: `${where}: invalid address`, detail: String(raw ?? '(missing)') })
    return null
  }
  if (a.raw) c.push({ level: 'error', title: `${where}: raw address`, detail: `Wallets MUST reject raw 0:… destinations. Use ${a.address.toString({ bounceable: true, testOnly: ctx.network === 'testnet' })} (bounceable, for contracts) or the UQ/0Q form (wallets).` })
  if (a.testOnly && ctx.network === 'mainnet') c.push({ level: 'error', title: `${where}: testnet-only address on mainnet`, detail: 'TEP-2: wallets refuse to send to a testnet address on mainnet.' })
  if (!a.testOnly && !a.raw && ctx.network === 'testnet') c.push({ level: 'info', title: `${where}: mainnet-form address on testnet`, detail: 'Accepted by most wallets, but the 0Q/kQ form makes the intent explicit.' })
  return (raw as string).trim()
}

function checkAmount(where: string, v: unknown, c: Check[]): bigint {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
    c.push({ level: 'warn', title: `${where}: amount is a number`, detail: 'It must be a decimal string of nanocoins ("100000000"). Large numbers lose precision in JSON.' })
    return BigInt(v)
  }
  if (typeof v !== 'string' || !DECIMAL.test(v)) {
    c.push({ level: 'error', title: `${where}: amount must be a decimal string of nanocoins`, detail: `Got ${JSON.stringify(v)}. 1 ${COIN_SYMBOL} = "${NANO_PER_COIN}".` })
    return 0n
  }
  return BigInt(v)
}

function checkExtra(where: string, v: unknown, ctx: Context, c: Check[], feature: FeatureSummary['sendTransaction'] | undefined): Record<string, string> | undefined {
  if (v === undefined) return undefined
  if (!isObj(v) || !Object.entries(v).every(([k, x]) => /^\d+$/.test(k) && typeof x === 'string' && DECIMAL.test(x))) {
    c.push({ level: 'error', title: `${where}: extra currency must map currency id to a decimal string`, detail: 'Example: {"100": "1000000"}' })
    return undefined
  }
  if (ctx.features && !feature?.extraCurrency) c.push({ level: 'error', title: `${where}: this wallet does not support extra currencies`, detail: 'Its features do not list extraCurrencySupported.' })
  return v as Record<string, string>
}

const ITEM_REQUIRED: Record<string, string[]> = { ton: ['address', 'amount'], jetton: ['master', 'destination', 'amount'], nft: ['nftAddress', 'newOwner'] }

export function validateRequest(text: string, ctx: Context): Validated {
  const c: Check[] = []
  let v: unknown
  try {
    v = unwrap(text)
  }
  catch (e) {
    return { request: null, checks: [{ level: 'error', title: 'Not valid JSON', detail: (e as Error).message }], total: 0n }
  }
  if (!isObj(v)) return { request: null, checks: [{ level: 'error', title: 'The request must be a JSON object' }], total: 0n }

  const feature = ctx.features ? (ctx.signOnly ? ctx.features.signMessage : ctx.features.sendTransaction) : undefined
  if (ctx.features && !feature) c.push({ level: 'error', title: `This wallet does not support ${ctx.signOnly ? 'signMessage' : 'sendTransaction'}` })

  // valid_until / validUntil
  let validUntil = v.validUntil ?? v.valid_until
  if (validUntil === undefined) {
    validUntil = ctx.nowSec + 300
    c.push({ level: 'info', title: 'validUntil not set: using now + 5 minutes', detail: String(validUntil) })
  }
  else if (typeof validUntil !== 'number' || !Number.isInteger(validUntil)) {
    c.push({ level: 'error', title: 'validUntil must be an integer (unix seconds)' })
  }
  else if (validUntil > 1e12) {
    c.push({ level: 'error', title: 'validUntil looks like milliseconds', detail: `Use seconds: ${Math.floor(validUntil / 1000)}.` })
  }
  else if (validUntil <= ctx.nowSec) {
    c.push({ level: 'error', title: 'validUntil is in the past', detail: `Expired ${ctx.nowSec - validUntil} s ago. The wallet MUST reject it.` })
  }

  // network
  let network = v.network
  if (network === undefined) {
    network = CHAIN[ctx.network]
    c.push({ level: 'info', title: `network not set: using ${network} (${ctx.network})`, detail: 'dApps SHOULD set it explicitly.' })
  }
  else if (typeof network !== 'string') {
    c.push({ level: 'error', title: 'network must be a string ("-239" or "-3")' })
  }
  else if (network !== CHAIN[ctx.network]) {
    c.push({ level: 'error', title: `network ${network} does not match the site network (${ctx.network}, ${CHAIN[ctx.network]})`, detail: 'Switch the network in the header, or fix the field.' })
  }

  // from
  let from: string | undefined
  if (v.from !== undefined) {
    const a = addr(v.from)
    if (!a) c.push({ level: 'error', title: 'from: invalid address' })
    else {
      from = a.address.toRawString()
      if (ctx.wallet && !Address.parse(ctx.wallet).equals(a.address)) c.push({ level: 'error', title: 'from is not the connected wallet', detail: 'The wallet MUST refuse to send from another account.' })
    }
  }

  const hasMsgs = v.messages !== undefined
  const hasItems = v.items !== undefined
  if (hasMsgs === hasItems) c.push({ level: 'error', title: hasMsgs ? 'Use messages or items, not both' : 'Add messages (or items)' })

  let total = 0n
  let messages: SdkMessage[] | undefined
  let items: SdkItem[] | undefined
  const list = hasMsgs ? v.messages : v.items
  if ((hasMsgs || hasItems) && (!Array.isArray(list) || !list.length)) c.push({ level: 'error', title: `${hasMsgs ? 'messages' : 'items'} must be a non-empty array` })
  else if (Array.isArray(list) && feature && list.length > feature.maxMessages) {
    c.push({ level: 'error', title: `${list.length} messages, but this wallet accepts at most ${feature.maxMessages}` })
  }

  if (hasMsgs && Array.isArray(v.messages)) {
    messages = v.messages.map((m: unknown, i: number) => {
      const where = `messages[${i}]`
      if (!isObj(m)) {
        c.push({ level: 'error', title: `${where} must be an object` })
        return { address: '', amount: '0' }
      }
      const address = checkDestination(where, m.address, ctx, c) ?? ''
      const amount = checkAmount(where, m.amount, c)
      total += amount
      const out: SdkMessage = { address, amount: amount.toString() }
      for (const k of ['payload', 'stateInit'] as const) {
        if (m[k] === undefined) continue
        const err = boc(m[k])
        if (err) c.push({ level: 'error', title: `${where}.${k} ${err}` })
        else out[k] = m[k] as string
      }
      const extra = checkExtra(where, m.extraCurrency ?? m.extra_currency, ctx, c, feature)
      if (extra) out.extraCurrency = extra
      return out
    })
  }

  if (hasItems && Array.isArray(v.items)) {
    items = v.items.map((it: unknown, i: number) => {
      const where = `items[${i}]`
      if (!isObj(it) || typeof it.type !== 'string' || !ITEM_REQUIRED[it.type]) {
        c.push({ level: 'error', title: `${where}: type must be "ton", "jetton" or "nft"` })
        return it as SdkItem
      }
      if (feature && !(feature.itemTypes as string[]).includes(it.type)) c.push({ level: 'error', title: `${where}: this wallet does not accept "${it.type}" items`, detail: feature.itemTypes.length ? `It accepts: ${feature.itemTypes.join(', ')}.` : 'It accepts raw messages only.' })
      for (const k of ITEM_REQUIRED[it.type]!) if (it[k] === undefined) c.push({ level: 'error', title: `${where}: missing ${k}` })
      if (it.type === 'ton') {
        checkDestination(where, it.address, ctx, c)
        total += checkAmount(where, it.amount, c)
      }
      else {
        for (const k of it.type === 'jetton' ? ['master', 'destination'] : ['nftAddress', 'newOwner']) if (it[k] !== undefined && !addr(it[k])) c.push({ level: 'error', title: `${where}: ${k} is not a valid address` })
        if (it.type === 'jetton' && it.amount !== undefined && !(typeof it.amount === 'string' && DECIMAL.test(it.amount))) c.push({ level: 'error', title: `${where}: amount must be a decimal string of jetton base units` })
        if (typeof it.attachAmount === 'string' && DECIMAL.test(it.attachAmount)) total += BigInt(it.attachAmount)
      }
      for (const k of ['payload', 'stateInit', 'customPayload', 'forwardPayload']) {
        if (it[k] === undefined) continue
        const err = boc(it[k])
        if (err) c.push({ level: 'error', title: `${where}.${k} ${err}` })
      }
      return it as SdkItem
    })
  }

  if (!c.some(x => x.level === 'error' || x.level === 'warn')) c.unshift({ level: 'ok', title: ctx.features ? 'Valid for the connected wallet' : 'Valid request (connect a wallet to check it against its features)' })
  const ok = !c.some(x => x.level === 'error')
  return {
    request: ok ? { validUntil: validUntil as number, network: network as string, ...(from ? { from } : {}), ...(messages ? { messages } : { items }) } : null,
    checks: c,
    total
  }
}

/** Messages TxPreview can show: raw messages and "ton" items (jetton/nft items are built by the wallet). */
export function previewMessages(r: SdkRequest): TonConnectMessage[] {
  const src = r.messages ?? (r.items ?? []).filter((i): i is Extract<SdkItem, { type: 'ton' }> => i.type === 'ton')
  return src.map(m => ({ address: m.address, amount: m.amount, payload: m.payload, stateInit: m.stateInit }))
}

/** Ready-made requests addressed to `self` (the connected wallet, or an example). Amounts are tiny on purpose. */
export function templates(self: string, network: Net, nowSec: number): { id: string, label: string, json: string }[] {
  const a = Address.parse(self)
  const to = a.toString({ bounceable: false, testOnly: network === 'testnet' })
  const base = { validUntil: nowSec + 300, network: CHAIN[network] }
  const comment = (t: string) => commentBody(t).toBoc().toString('base64')
  const j = (o: unknown) => JSON.stringify(o, null, 2)
  return [
    { id: 'comment', label: 'Send 0.01 to yourself with a comment', json: j({ ...base, from: a.toRawString(), messages: [{ address: to, amount: '10000000', payload: comment('TonUtils TonConnect test') }] }) },
    { id: 'two', label: 'Two messages in one request', json: j({ ...base, messages: [{ address: to, amount: '10000000', payload: comment('message 1') }, { address: to, amount: '20000000', payload: comment('message 2') }] }) },
    { id: 'items', label: 'Structured "ton" item (TonConnect 5)', json: j({ ...base, items: [{ type: 'ton', address: to, amount: '10000000', payload: comment('structured item') }] }) },
    { id: 'wire', label: 'Spec wire format (valid_until, RPC envelope)', json: j({ method: 'sendTransaction', params: [JSON.stringify({ valid_until: base.validUntil, network: base.network, messages: [{ address: to, amount: '10000000' }] })], id: '1' }) }
  ]
}

export type SignDataKind = 'text' | 'binary' | 'cell'

/** signData payload for the SDK, or an error message. Binary takes base64 or hex; cell takes a base64 BOC + TL-B schema. */
export function signDataPayload(kind: SignDataKind, value: string, schema = ''): { payload: { type: 'text', text: string } | { type: 'binary', bytes: string } | { type: 'cell', schema: string, cell: string } } | { error: string } {
  if (!value.trim()) return { error: 'Enter something to sign.' }
  if (kind === 'text') return { payload: { type: 'text', text: value } }
  if (kind === 'binary') {
    const v = value.trim()
    if (/^(0x)?([0-9a-f]{2})+$/i.test(v)) return { payload: { type: 'binary', bytes: Buffer.from(v.replace(/^0x/i, ''), 'hex').toString('base64') } }
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) return { payload: { type: 'binary', bytes: v } }
    return { error: 'Binary data must be hex or base64.' }
  }
  const err = boc(value.trim())
  if (err) return { error: `Cell ${err}` }
  if (!schema.trim()) return { error: 'A cell payload needs its TL-B schema (the last type is the root).' }
  return { payload: { type: 'cell', schema: schema.trim(), cell: value.trim() } }
}
