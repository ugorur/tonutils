// tonapi.io v2 events -> plain-language actions and signed value flows, shared by the tx-user tools.
// Shapes follow tonapi's OpenAPI (github.com/tonkeeper/opentonapi api/openapi.json). tonapi renamed
// some GRAM fields (ton_in -> gram_in, ton_attached -> gram_attached); both spellings are read.
import { Address } from '@ton/core'
import { COIN_DECIMALS, COIN_SYMBOL } from '~/utils/currency'
import { formatAmount } from '~/utils/units'

export interface TaAccount {
  address: string
  name?: string
  is_scam?: boolean
  is_wallet?: boolean
}

export interface TaJetton {
  address: string
  name?: string
  symbol?: string
  decimals?: number
  verification?: string
}

export interface TaPrice {
  value: string
  decimals: number
  token_name: string
  currency_type?: string
  jetton?: string
}

export interface TaAction {
  type: string
  status: 'ok' | 'failed'
  simple_preview?: { name?: string, description?: string, value?: string }
  base_transactions?: string[]
  [payload: string]: unknown
}

export interface TaEvent {
  event_id: string
  timestamp: number
  actions: TaAction[]
  is_scam?: boolean
  lt: number
  in_progress: boolean
  /** Account-scoped events only: nanoGRAM gained (+) or lost (-) beyond the actions. Negative = fees. */
  extra?: number
  account?: TaAccount
  ext_msg_hash?: string
}

export interface TaEventsPage {
  events: TaEvent[]
  next_from: number
}

export interface Asset {
  symbol: string
  decimals: number
  /** Raw lowercase jetton master; undefined for the native coin. */
  master?: string
  name?: string
  verification?: string
}

export interface Flow {
  asset: Asset
  /** Signed relative to the viewer (+ received, - sent). Positive when there is no viewer. */
  amount: bigint
}

export type ActionKind = 'send' | 'receive' | 'swap' | 'nft' | 'stake' | 'contract' | 'other'

export interface ActionView {
  type: string
  kind: ActionKind
  ok: boolean
  /** "Sent 10 USD₮", "Swapped 40.98 USD₮ for 30.71 GRAM on STON.fi". */
  title: string
  from?: TaAccount
  to?: TaAccount
  /** The other side, relative to the viewer. */
  counterparty?: TaAccount
  comment?: string
  encrypted?: boolean
  /** Value that moved for the viewer (or the transferred value without a viewer). Empty for failed actions. */
  flows: Flow[]
  /** The value this action is about (transfer amount, NFT price), also for failed actions. */
  value?: { asset: Asset, amount: bigint }
  nft?: string
  spam: boolean
}

export const COIN_ASSET: Asset = { symbol: COIN_SYMBOL, decimals: COIN_DECIMALS }

const DEX_NAMES: Record<string, string> = { stonfi: 'STON.fi', dedust: 'DeDust', megatonfi: 'Megaton Finance', tonco: 'TONCO', moki: 'Moki' }

/** Raw lowercase form of any TON address ("0:abc…"), or the input lowercased when it does not parse. */
export function rawAddress(a: string): string {
  try {
    return Address.parse(a.trim()).toRawString().toLowerCase()
  }
  catch {
    return a.trim().toLowerCase()
  }
}

/** User-friendly form: non-bounceable (UQ…) for wallets, bounceable (EQ…) for contracts. */
export function friendlyAddress(raw: string, isWallet = true, testOnly = false): string {
  try {
    return Address.parse(raw).toString({ bounceable: !isWallet, testOnly, urlSafe: true })
  }
  catch {
    return raw
  }
}

export function jettonAsset(j: TaJetton): Asset {
  return { symbol: j.symbol || j.name || 'jetton', decimals: j.decimals ?? 9, master: j.address.toLowerCase(), name: j.name, verification: j.verification }
}

function priceAsset(p: TaPrice): Asset {
  if (p.currency_type === 'jetton' && p.jetton) return { symbol: p.token_name, decimals: p.decimals, master: p.jetton.toLowerCase() }
  return COIN_ASSET
}

/** Short exact amount for titles: up to 4 decimals (truncated), but never rounds a non-zero value to "0". */
export function shortAmount(units: bigint, decimals: number): string {
  const abs = units < 0n ? -units : units
  const short = formatAmount(abs, decimals, { maxDecimals: Math.min(decimals, 4) })
  return short === '0' && abs !== 0n ? formatAmount(abs, decimals) : short
}

export function assetLabel(units: bigint, asset: Asset): string {
  return `${shortAmount(units, asset.decimals)} ${asset.symbol}`
}

function big(v: unknown): bigint {
  try {
    return v === undefined || v === null || v === '' ? 0n : BigInt(v as string | number)
  }
  catch {
    return 0n
  }
}

function accountName(a?: TaAccount): string {
  return a?.name ?? ''
}

function isScam(...xs: (TaAccount | undefined)[]): boolean {
  return xs.some(x => x?.is_scam)
}

/**
 * Describes one tonapi action. With a viewer (raw or friendly address) the title and flows are relative
 * to that account ("Sent", "Received"); without one they are neutral ("Transfer of …").
 */
export function describeAction(action: TaAction, viewer?: string): ActionView {
  const me = viewer ? rawAddress(viewer) : undefined
  const ok = action.status === 'ok'
  const p = (action[action.type] ?? {}) as Record<string, unknown>
  const is = (a?: TaAccount) => !!me && !!a && a.address.toLowerCase() === me
  const fallback = action.simple_preview?.description || action.simple_preview?.name || action.type

  const base: ActionView = { type: action.type, kind: 'other', ok, title: fallback, flows: [], spam: false }

  // Transfers of one asset between two accounts.
  const transfer = (asset: Asset, amount: bigint, from?: TaAccount, to?: TaAccount, kind: ActionKind | null = null): ActionView => {
    const label = assetLabel(amount, asset)
    const v: ActionView = {
      ...base,
      from,
      to,
      comment: (p.comment as string | undefined) || undefined,
      encrypted: !!p.encrypted_comment,
      value: { asset, amount },
      spam: isScam(from, to) || asset.verification === 'blacklist'
    }
    if (is(from) && is(to)) {
      return { ...v, kind: kind ?? 'send', title: `Sent ${label} to yourself`, counterparty: to, flows: [] }
    }
    if (is(from)) return { ...v, kind: kind ?? 'send', title: `Sent ${label}`, counterparty: to, flows: ok ? [{ asset, amount: -amount }] : [] }
    if (is(to)) return { ...v, kind: kind ?? 'receive', title: `Received ${label}`, counterparty: from, flows: ok ? [{ asset, amount }] : [] }
    return { ...v, kind: kind ?? (me ? 'other' : 'send'), title: `Transfer of ${label}`, flows: ok && !me ? [{ asset, amount }] : [] }
  }

  switch (action.type) {
    case 'TonTransfer':
      return transfer(COIN_ASSET, big(p.amount), p.sender as TaAccount, p.recipient as TaAccount)
    case 'JettonTransfer':
      return transfer(jettonAsset(p.jetton as TaJetton), big(p.amount), p.sender as TaAccount | undefined, p.recipient as TaAccount | undefined)
    case 'ExtraCurrencyTransfer': {
      const c = (p.currency ?? {}) as { symbol?: string, decimals?: number, id?: number }
      return transfer({ symbol: c.symbol ?? `EC#${c.id ?? '?'}`, decimals: c.decimals ?? 9 }, big(p.amount), p.sender as TaAccount, p.recipient as TaAccount)
    }
    case 'Purchase':
      return transfer(priceAsset(p.amount as TaPrice), big((p.amount as TaPrice).value), p.source as TaAccount, p.destination as TaAccount)
    case 'JettonSwap': {
      const inAsset = p.jetton_master_in ? jettonAsset(p.jetton_master_in as TaJetton) : COIN_ASSET
      const outAsset = p.jetton_master_out ? jettonAsset(p.jetton_master_out as TaJetton) : COIN_ASSET
      const amountIn = p.jetton_master_in ? big(p.amount_in) : big(p.gram_in ?? p.ton_in)
      const amountOut = p.jetton_master_out ? big(p.amount_out) : big(p.gram_out ?? p.ton_out)
      const dex = DEX_NAMES[p.dex as string] ?? (p.dex as string)
      const router = p.router as TaAccount
      const user = p.user_wallet as TaAccount
      const mine = !me || is(user)
      return {
        ...base,
        kind: 'swap',
        title: `Swapped ${assetLabel(amountIn, inAsset)} for ${assetLabel(amountOut, outAsset)}${dex ? ` on ${dex}` : ''}`,
        from: user,
        to: router,
        counterparty: router,
        flows: ok && mine ? [{ asset: inAsset, amount: -amountIn }, { asset: outAsset, amount: amountOut }] : [],
        spam: isScam(router) || inAsset.verification === 'blacklist' || outAsset.verification === 'blacklist'
      }
    }
    case 'JettonBurn': {
      const asset = jettonAsset(p.jetton as TaJetton)
      const amount = big(p.amount)
      return { ...base, kind: 'send', title: `Burned ${assetLabel(amount, asset)}`, from: p.sender as TaAccount, flows: ok ? [{ asset, amount: -amount }] : [] }
    }
    case 'JettonMint': {
      const asset = jettonAsset(p.jetton as TaJetton)
      const amount = big(p.amount)
      const to = p.recipient as TaAccount
      return { ...base, kind: 'receive', title: `${is(to) ? 'Received newly minted' : 'Minted'} ${assetLabel(amount, asset)}`, to, flows: ok && (!me || is(to)) ? [{ asset, amount }] : [] }
    }
    case 'NftItemTransfer': {
      const from = p.sender as TaAccount | undefined
      const to = p.recipient as TaAccount | undefined
      const v = { ...base, kind: 'nft' as const, from, to, nft: p.nft as string, comment: (p.comment as string | undefined) || undefined, spam: isScam(from, to) }
      if (is(from)) return { ...v, title: 'Sent an NFT', counterparty: to }
      if (is(to)) return { ...v, title: 'Received an NFT', counterparty: from }
      return { ...v, title: 'NFT transfer' }
    }
    case 'NftPurchase': {
      const price = p.amount as TaPrice
      const asset = priceAsset(price)
      const amount = big(price.value)
      const nft = p.nft as { address: string, metadata?: { name?: string } }
      const name = nft?.metadata?.name ? ` "${nft.metadata.name}"` : ''
      const buyer = p.buyer as TaAccount
      const seller = p.seller as TaAccount
      const v = { ...base, kind: 'nft' as const, from: buyer, to: seller, nft: nft?.address, value: { asset, amount }, spam: isScam(buyer, seller) }
      if (is(seller)) return { ...v, title: `Sold NFT${name} for ${assetLabel(amount, asset)}`, counterparty: buyer, flows: ok ? [{ asset, amount }] : [] }
      return { ...v, title: `${me ? 'Bought' : 'Purchase of'} NFT${name} for ${assetLabel(amount, asset)}`, counterparty: seller, flows: ok ? [{ asset, amount: me ? -amount : amount }] : [] }
    }
    case 'AuctionBid': {
      const price = p.amount as TaPrice
      const asset = priceAsset(price)
      const amount = big(price.value)
      const nft = p.nft as { address: string, metadata?: { name?: string } } | undefined
      const what = nft?.metadata?.name ? ` on "${nft.metadata.name}"` : ''
      return { ...base, kind: 'nft', title: `Bid ${assetLabel(amount, asset)}${what}`, from: p.bidder as TaAccount, to: p.auction as TaAccount, counterparty: p.auction as TaAccount, nft: nft?.address, flows: ok && (!me || is(p.bidder as TaAccount)) ? [{ asset, amount: me ? -amount : amount }] : [] }
    }
    case 'DepositStake':
    case 'ElectionsDepositStake': {
      const amount = big(p.amount)
      const pool = (p.pool ?? p.elector) as TaAccount | undefined
      return { ...base, kind: 'stake', title: `Staked ${assetLabel(amount, COIN_ASSET)}${accountName(pool) ? ` in ${accountName(pool)}` : ''}`, from: p.staker as TaAccount, to: pool, counterparty: pool, flows: ok ? [{ asset: COIN_ASSET, amount: me ? -amount : amount }] : [] }
    }
    case 'WithdrawStake':
    case 'ElectionsRecoverStake': {
      const amount = big(p.amount)
      const pool = (p.pool ?? p.elector) as TaAccount | undefined
      return { ...base, kind: 'stake', title: `Unstaked ${assetLabel(amount, COIN_ASSET)}${accountName(pool) ? ` from ${accountName(pool)}` : ''}`, from: pool, to: p.staker as TaAccount, counterparty: pool, flows: ok ? [{ asset: COIN_ASSET, amount }] : [] }
    }
    case 'WithdrawStakeRequest': {
      const pool = p.pool as TaAccount
      return { ...base, kind: 'stake', title: `Requested unstake${accountName(pool) ? ` from ${accountName(pool)}` : ''}`, from: p.staker as TaAccount, to: pool, counterparty: pool }
    }
    case 'SmartContractExec': {
      const contract = p.contract as TaAccount
      const attached = big(p.gram_attached ?? p.ton_attached)
      const op = p.operation ? String(p.operation) : 'a method'
      const executor = p.executor as TaAccount
      return {
        ...base,
        kind: 'contract',
        title: `Called ${op} on ${accountName(contract) || 'a contract'}${attached ? ` with ${assetLabel(attached, COIN_ASSET)}` : ''}`,
        from: executor,
        to: contract,
        counterparty: is(contract) ? executor : contract,
        flows: ok && attached ? (is(contract) ? [{ asset: COIN_ASSET, amount: attached }] : [{ asset: COIN_ASSET, amount: me ? -attached : attached }]) : [],
        spam: isScam(executor, contract)
      }
    }
    case 'ContractDeploy': {
      const ifaces = (p.interfaces as string[] | undefined) ?? []
      return { ...base, kind: 'contract', title: `Deployed ${ifaces.length ? ifaces.join(', ') : 'a contract'}`, to: { address: String(p.address ?? '') } }
    }
    case 'DomainRenew':
      return { ...base, kind: 'other', title: `Renewed domain ${p.domain as string}`, from: p.renewer as TaAccount }
    case 'Subscribe': {
      const amount = big(p.amount ?? (p.price as TaPrice | undefined)?.value)
      const asset = p.price ? priceAsset(p.price as TaPrice) : COIN_ASSET
      const sub = p.subscriber as TaAccount
      const ben = p.beneficiary as TaAccount
      return transfer(asset, amount, sub, ben, 'send')
    }
    case 'UnSubscribe':
      return { ...base, kind: 'other', title: 'Cancelled a subscription', from: p.subscriber as TaAccount, to: p.beneficiary as TaAccount }
    default:
      return base
  }
}

/** Every distinct asset that moved in these events (for filters and fiat lookups). */
export function assetsOf(views: ActionView[]): Asset[] {
  const seen = new Map<string, Asset>()
  for (const v of views) for (const f of v.flows) seen.set(f.asset.master ?? 'native', f.asset)
  return [...seen.values()]
}

export function assetKey(a: Asset): string {
  return a.master ?? 'native'
}

/**
 * The viewer's fee for an account-scoped event (`extra` < 0 is what the actions do not explain).
 * When one of the viewer's own actions failed, the bounced value comes back as a separate incoming
 * GRAM transfer from a contract. That transfer is a refund, not income: it is relabelled, its flow is
 * removed, and it is netted against `extra`, so the fee is what the attempt really cost.
 * Mutates the refund views in `views`.
 */
export function viewerFee(ev: Pick<TaEvent, 'extra'>, views: ActionView[], viewer: string): { fee: bigint, otherIn: bigint } {
  const me = rawAddress(viewer)
  const mine = (a?: TaAccount) => !!a && a.address.toLowerCase() === me
  let refunded = 0n
  if (views.some(v => !v.ok && mine(v.from))) {
    for (const v of views) {
      if (v.ok && v.type === 'TonTransfer' && mine(v.to) && !mine(v.from) && v.from?.is_wallet === false && v.value) {
        refunded += v.value.amount
        v.title = `Refund of ${assetLabel(v.value.amount, v.value.asset)} (bounced)`
        v.flows = []
      }
    }
  }
  const net = BigInt(ev.extra ?? 0) + refunded
  return { fee: net < 0n ? -net : 0n, otherIn: net > 0n ? net : 0n }
}
