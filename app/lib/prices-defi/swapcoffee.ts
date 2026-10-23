// swap.coffee aggregator (keyless, CORS *): best route across TON DEXes and ready-to-sign messages.
// POST https://backend.swap.coffee/v1/route, POST https://backend.swap.coffee/v2/route/transactions.
import { Address, Cell, beginCell } from '@ton/core'
import type { Slice } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { COIN_SYMBOL } from '~/utils/currency'
import { decodeBody } from '~/utils/ton/messages'
import type { Asset } from './assets'
import { floatToUnits, ids } from './assets'

export const SWAP_COFFEE = 'https://backend.swap.coffee'

interface TokenRef { address: { blockchain: string, address: string }, metadata?: { symbol?: string, decimals?: number } }

export interface SwapCoffeePath {
  dex: string
  pool_address: string
  input_token: TokenRef
  output_token: TokenRef
  swap: { input_amount: number, output_amount: number }
  recommended_gas?: number
  next?: SwapCoffeePath[]
}

export interface SwapCoffeeRoute {
  input_amount: number
  output_amount: number
  input_usd?: number
  output_usd?: number
  price_impact?: number
  recommended_gas?: number
  paths: SwapCoffeePath[]
}

export interface SwapCoffeeTx { address: string, value: string, cell: string, send_mode?: number, query_id?: number }

export function routeBody(from: Asset, to: Asset, amount: number) {
  return {
    input_token: { blockchain: 'ton', address: ids.swapCoffee(from) },
    output_token: { blockchain: 'ton', address: ids.swapCoffee(to) },
    input_amount: amount
  }
}

export function transactionsBody(sender: string, slippage: number, route: SwapCoffeeRoute) {
  return { sender_address: sender, slippage, paths: route.paths }
}

const DEX_NAMES: Record<string, string> = { stonfi: 'STON.fi v1', stonfi_v2: 'STON.fi v2', dedust: 'DeDust', dedust_v2: 'DeDust v2', tonco: 'TONCO', tonco_v2: 'TONCO v2', coffee: 'Coffee', megaton: 'Megaton' }
export const dexName = (id: string) => DEX_NAMES[id] ?? id.replace(/_/g, ' ')

export interface RoutePart {
  /** Share of the input, 0..1. */
  share: number
  dexes: string[]
  symbols: string[]
}

/** Each split of the route as a chain of hops (paths may continue through `next`). */
export function routeParts(route: SwapCoffeeRoute): RoutePart[] {
  return route.paths.map((p) => {
    const dexes: string[] = []
    const symbols = [p.input_token.metadata?.symbol ?? '?']
    let hop: SwapCoffeePath | undefined = p
    while (hop) {
      dexes.push(dexName(hop.dex))
      symbols.push(hop.output_token.metadata?.symbol ?? '?')
      hop = hop.next?.[0]
    }
    return { share: route.input_amount ? p.swap.input_amount / route.input_amount : 1, dexes, symbols }
  })
}

export function routeLabel(route: SwapCoffeeRoute): string {
  const parts = routeParts(route)
  const one = (p: RoutePart) => `${p.symbols.join(' → ')} via ${[...new Set(p.dexes)].join(' + ')}`
  if (parts.length === 1) return one(parts[0]!)
  return `Split ${parts.length} ways: ${parts.map(p => `${Math.round(p.share * 100)}% ${one(p)}`).join('; ')}`
}

/** The API returns floats; the output is for display and comparison, truncated to the token's decimals. */
export function routeOutUnits(route: SwapCoffeeRoute, decimals: number): bigint {
  return floatToUnits(route.output_amount, decimals)
}

export function toMessages(txs: SwapCoffeeTx[]): TonConnectMessage[] {
  return txs.map(t => ({ address: t.address, amount: t.value, payload: t.cell }))
}

/** Max extra GRAM a swap message may attach for gas (swap.coffee recommends 0.185–0.6 per hop). */
export const GAS_CAP_PER_MESSAGE = 1_000_000_000n

export interface CheckInput {
  from: Asset
  /** Input amount in base units. */
  units: bigint
  /** The connected wallet: swap output, refunds and excesses must go back here. */
  owner?: string
  /** Your jetton wallet for `from` (required for jetton input: the messages must go there). */
  jettonWallet?: string
  /** STON.fi/DeDust contracts the funds may enter (from STON.fi's router list and the DeDust factory). */
  dexes?: DexContracts
}

/** Contracts that may receive the user's funds for a STON.fi or DeDust swap. */
export interface DexContracts {
  /** STON.fi routers (jetton input goes here). */
  stonfiRouters: Address[]
  /** STON.fi pTON wallets of those routers (GRAM input goes here). */
  stonfiPtonWallets: Address[]
  /** DeDust vault of the input asset (native vault for GRAM, the jetton's vault otherwise). */
  dedustVault: Address | null
}

/** GET https://api.ston.fi/v1/routers -> addresses. */
export function stonfiContracts(res: { router_list: { address: string, pton_wallet_address?: string }[] }) {
  return {
    stonfiRouters: res.router_list.map(r => Address.parse(r.address)),
    stonfiPtonWallets: res.router_list.flatMap(r => (r.pton_wallet_address ? [Address.parse(r.pton_wallet_address)] : []))
  }
}

/** DeDust mainnet factory (@dedust/sdk MAINNET_FACTORY_ADDR). get_vault_address(asset) gives the asset's vault. */
export const DEDUST_FACTORY = 'EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67'

/** DeDust Asset slice (native$0000, jetton$0001 workchain:int8 address:uint256) as base64 BOC for a get-method arg. */
export function dedustAssetSlice(a: Asset): string {
  const b = beginCell()
  if (a.kind === 'native') b.storeUint(0, 4)
  else {
    const addr = Address.parse(a.address)
    b.storeUint(1, 4).storeInt(addr.workChain, 8).storeBuffer(addr.hash)
  }
  return b.endCell().toBoc().toString('base64')
}

/** Where a swap message sends its output (and refunds/excesses), read from the DEX payload. */
export interface SwapTargets {
  dex: string
  /** Output receiver; null = DeDust addr_none, which pays the sender. */
  recipient: Address | null
  /** Other addresses that get funds back (refund, excesses, response_destination). */
  returns: Address[]
  /** jetton_transfer destination: the DEX contract the jettons go to (null for GRAM-style messages). */
  dest?: Address | null
  /** STON.fi v2 multi-hop: receivers of the intermediate tokens (must be STON.fi routers or pTON wallets). */
  via?: Address[]
}

const loadEither = (s: Slice): Slice => (s.loadBit() ? s.loadRef().beginParse() : s)

// DeDust v2: SwapStep pool_addr params(kind:1 limit:Coins next:Maybe ^SwapStep), swap_params:^(deadline:uint32 recipient_addr ...).
function dedustRecipient(s: Slice): Address | null {
  s.loadAddress()
  s.loadBit()
  s.loadCoins()
  s.loadMaybeRef()
  const params = s.loadRef().beginParse()
  params.loadUint(32)
  return params.loadMaybeAddress()
}

/** STON.fi v1/v2 and DeDust swap payloads. Null when the payload is some other DEX's format. */
function payloadTargets(s: Slice, returns: Address[]): SwapTargets | null {
  if (s.remainingBits < 32) return null
  const op = s.loadUint(32)
  if (op === 0x25938561) { // STON.fi v1 swap: token_wallet min_out to_address ...
    s.loadAddress()
    s.loadCoins()
    return { dex: 'STON.fi v1', recipient: s.loadAddress(), returns }
  }
  if (op === 0x6664de2a) { // STON.fi v2 swap: other_token_wallet refund_address excesses_address deadline ^(min_out receiver ...)
    s.loadAddress()
    const refund = s.loadAddress()
    const excesses = s.loadAddress()
    s.skip(64)
    const cross = s.loadRef().beginParse()
    cross.loadCoins()
    const receiver = cross.loadAddress()
    cross.loadCoins()
    const all = [...returns, refund, excesses]
    // Multi-hop: the receiver is the next pool's router and custom_payload holds the next swap.
    const next = cross.loadMaybeRef()
    const hop = next ? payloadTargets(next.beginParse(), all) : null
    return hop ? { ...hop, dex: 'STON.fi v2', via: [receiver, ...(hop.via ?? [])] } : { dex: 'STON.fi v2', recipient: receiver, returns: all }
  }
  if (op === 0xe3a0d482) return { dex: 'DeDust', recipient: dedustRecipient(s), returns }
  return null
}

/** Parse a swap message body. Null when the format is not one we know (other DEXes). Throws on malformed cells. */
export function swapTargets(boc: string | Cell): SwapTargets | null {
  const s = (typeof boc === 'string' ? Cell.fromBase64(boc) : boc).beginParse()
  const op = s.loadUint(32)
  if (op === 0x0f8a7ea5) { // jetton_transfer (also STON.fi v1 pTON): query_id amount destination response custom fwd_ton forward_payload
    s.skip(64)
    s.loadCoins()
    const dest = s.loadAddress()
    const response = s.loadMaybeAddress()
    s.loadMaybeRef()
    s.loadCoins()
    const r = payloadTargets(loadEither(s), response ? [response] : [])
    return r && { ...r, dest }
  }
  if (op === 0x01f3835d) { // STON.fi pTON v2 ton_transfer: query_id ton_amount refund_address forward_payload:Either
    s.skip(64)
    s.loadCoins()
    const refund = s.loadAddress()
    return payloadTargets(loadEither(s), [refund])
  }
  if (op === 0xea06185d) { // DeDust native vault swap: query_id amount SwapStep ^SwapParams
    s.skip(64)
    s.loadCoins()
    return { dex: 'DeDust', recipient: dedustRecipient(s), returns: [] }
  }
  return null
}

/** The contract that first receives the user's funds must be a real STON.fi/DeDust contract for that payload. */
function entryOk(t: SwapCoffeeTx, r: SwapTargets, c: CheckInput, d: DexContracts): boolean {
  // GRAM input: the message itself goes to a pTON wallet or the native vault. Jetton input: the jetton_transfer destination.
  const entry = c.from.kind === 'native' ? Address.parse(t.address) : r.dest
  if (!entry) return false
  const allowed = r.dex.startsWith('STON.fi')
    ? (c.from.kind === 'native' ? d.stonfiPtonWallets : d.stonfiRouters)
    : (d.dedustVault ? [d.dedustVault] : [])
  // Intermediate hops pay the next router (jetton) or its pTON wallet (GRAM).
  const stonfi = [...d.stonfiRouters, ...d.stonfiPtonWallets]
  return allowed.some(a => a.equals(entry)) && (r.via ?? []).every(v => stonfi.some(a => a.equals(v)))
}

/** Output, refunds and excesses of each message must go to the owner, through a real DEX contract. Unknown formats are noted, not blocked. */
function checkTargets(txs: SwapCoffeeTx[], owner: Address, c: CheckInput, errors: string[]): number {
  let unknown = 0
  for (const t of txs) {
    let r: SwapTargets | null
    try {
      r = swapTargets(t.cell)
    }
    catch {
      errors.push('A message body could not be parsed.')
      continue
    }
    if (!r) {
      unknown++
      continue
    }
    if (r.recipient && !r.recipient.equals(owner)) errors.push(`A ${r.dex} message sends the swap output to another address, not your wallet.`)
    if (r.returns.some(a => !a.equals(owner))) errors.push(`A ${r.dex} message sends refunds or excess gas to another address, not your wallet.`)
    if (!c.dexes) errors.push('Could not load the STON.fi and DeDust contract addresses, so the messages cannot be checked. Try again.')
    else if (!entryOk(t, r, c, c.dexes)) errors.push(`A ${r.dex} message sends your funds to a contract that is not a ${r.dex.split(' ')[0]} router or vault.`)
  }
  return unknown
}

/**
 * Sanity checks on messages a third party built for us. Returns errors (block sending) and notes.
 * Every message: STON.fi/DeDust payloads must pay the output, refunds and excesses to `owner`, and the funds must
 * enter a STON.fi router/pTON wallet or the DeDust vault of the input asset (`dexes`).
 * Jetton input: every message must be a jetton_transfer from your own jetton wallet, together moving the amount (never more).
 * GRAM input: the GRAM attached must be the amount plus at most GAS_CAP_PER_MESSAGE per message.
 */
export interface CheckResult {
  errors: string[]
  notes: string[]
  /** Messages in a DEX format we cannot read: their receiver is unchecked, so the user must confirm. */
  unverified: number
}

export function checkSwapTxs(txs: SwapCoffeeTx[], c: CheckInput): CheckResult {
  const errors: string[] = []
  const notes: string[] = []
  if (!txs.length) return { errors: ['The aggregator returned no messages.'], notes, unverified: 0 }
  if (txs.length > 4) notes.push(`${txs.length} messages: older wallets (v3/v4) can sign at most 4 at once.`)
  const unverified = c.owner ? checkTargets(txs, Address.parse(c.owner), c, errors) : txs.length
  const total = txs.reduce((s, t) => s + BigInt(t.value), 0n)
  const n = BigInt(txs.length)

  if (c.from.kind === 'native') {
    if (total < c.units) errors.push(`The messages attach less ${COIN_SYMBOL} than the amount you entered.`)
    if (total > c.units + GAS_CAP_PER_MESSAGE * n) errors.push(`The messages attach far more ${COIN_SYMBOL} than the amount plus gas.`)
    return { errors: [...new Set(errors)], notes, unverified }
  }

  if (!c.jettonWallet) errors.push(`Could not confirm your ${c.from.symbol} wallet address, so the messages cannot be checked. Reload your balance and try again.`)
  let moved = 0n
  for (const t of txs) {
    const body = decodeBody(t.cell)
    if (body.name !== 'jetton_transfer' || typeof body.fields.amount !== 'bigint') {
      errors.push(`Unexpected message (${body.title}); expected a jetton transfer.`)
      continue
    }
    moved += body.fields.amount
    if (BigInt(t.value) > GAS_CAP_PER_MESSAGE) errors.push(`A message attaches more than 1 ${COIN_SYMBOL} of gas.`)
    if (c.jettonWallet && !Address.parse(t.address).equals(Address.parse(c.jettonWallet))) errors.push('A message is not sent from your own jetton wallet.')
  }
  // Moving a hair less (float rounding in the split) is harmless; moving more is not.
  if (!errors.length && (moved > c.units || moved < c.units - c.units / 1000n)) errors.push(`The messages move ${moved} base units, not the ${c.units} you entered.`)
  return { errors: [...new Set(errors)], notes, unverified }
}
