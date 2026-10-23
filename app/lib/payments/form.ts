// The payment form shared by the payment tools: a draft of plain strings -> validated PaymentRequest.
import { COIN_DECIMALS, COIN_SYMBOL } from '~/utils/currency'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import { parseUnits, formatUnits } from '~/utils/units'
import type { AssetInfo, ParsedLink, PaymentRequest } from './link'
import { checkAddress, knownJetton, normalizeBoc } from './link'

export const COIN_ASSET = 'coin'
export const CUSTOM_ASSET = 'custom'

export interface PaymentDraft {
  to: string
  /** COIN_ASSET, a KNOWN_JETTONS master, or CUSTOM_ASSET. */
  asset: string
  customJetton: string
  /** Decimals of a custom jetton. */
  decimals: string
  /** Human amount ("12.5"), empty = payer chooses. */
  amount: string
  text: string
  /** Optional body BOC (advanced; replaces the comment). */
  bin: string
  /** Expiry, unix seconds. */
  exp: number | null
}

export const emptyDraft = (): PaymentDraft => ({ to: '', asset: COIN_ASSET, customJetton: '', decimals: '9', amount: '', text: '', bin: '', exp: null })

export type DraftField = 'to' | 'amount' | 'jetton' | 'decimals' | 'bin' | 'exp'

export interface DraftResult {
  request: PaymentRequest | null
  asset: AssetInfo
  errors: Partial<Record<DraftField, string>>
  warnings: string[]
}

export interface DraftOptions {
  testnet?: boolean
  requireAmount?: boolean
  now?: number
}

export function draftAsset(d: PaymentDraft): AssetInfo {
  if (d.asset === COIN_ASSET) return { symbol: COIN_SYMBOL, decimals: COIN_DECIMALS, known: true }
  if (d.asset === CUSTOM_ASSET) {
    const n = Number(d.decimals)
    const a = checkAddress(d.customJetton)
    return { symbol: 'tokens', decimals: Number.isInteger(n) && n >= 0 && n <= 255 ? n : 9, master: a.ok ? a.friendly : undefined, known: false }
  }
  const k = KNOWN_JETTONS.find(j => j.master === d.asset)
  return k ? { symbol: k.symbol, decimals: k.decimals, master: k.master, known: true } : { symbol: COIN_SYMBOL, decimals: COIN_DECIMALS, known: true }
}

export function draftToRequest(d: PaymentDraft, o: DraftOptions = {}): DraftResult {
  const errors: DraftResult['errors'] = {}
  const warnings: string[] = []
  const asset = draftAsset(d)

  const to = checkAddress(d.to, o.testnet)
  if (!to.ok) {
    if (d.to.trim()) errors.to = to.error
  }
  else if (to.testOnly !== !!o.testnet) {
    warnings.push(to.testOnly
      ? 'This is a testnet address (0Q…/kQ…). Mainnet wallets may refuse it or warn the payer.'
      : 'This is a mainnet-form address but the site is on testnet. Switch the network in the header if the payment is meant for testnet.')
  }

  if (d.asset === CUSTOM_ASSET) {
    if (!checkAddress(d.customJetton).ok) errors.jetton = d.customJetton.trim() ? 'Not a valid jetton master address.' : 'Enter the jetton master (token contract) address.'
    const n = Number(d.decimals)
    if (!/^\d{1,3}$/.test(d.decimals.trim()) || n > 255) errors.decimals = 'Decimals must be a whole number (USD₮ uses 6, most tokens 9).'
  }
  if (asset.master && o.testnet && asset.known) warnings.push(`${asset.symbol} is a mainnet token. On testnet use the testnet master address (choose "Other token").`)

  let amount: bigint | undefined
  if (d.amount.trim()) {
    try {
      amount = parseUnits(d.amount, asset.decimals)
      if (amount <= 0n) errors.amount = 'Enter an amount greater than zero.'
    }
    catch (e) {
      errors.amount = (e as Error).message
    }
  }
  else if (o.requireAmount) {
    errors.amount = 'Enter the amount to request.'
  }

  let bin: string | undefined
  if (d.bin.trim()) {
    const b = normalizeBoc(d.bin)
    if (!b.ok) errors.bin = b.error
    else bin = b.b64url
    if (amount === undefined && !errors.amount) errors.amount = 'A binary body (bin) needs an amount: wallets refuse bin links without one.'
    if (d.text.trim()) warnings.push('The binary body replaces the text comment, so the comment is left out of the link.')
  }

  if (d.exp !== null && d.exp <= (o.now ?? Date.now() / 1000)) errors.exp = 'The expiry time is in the past.'

  const ok = to.ok && !Object.keys(errors).length
  const request: PaymentRequest | null = ok
    ? {
        to: to.friendly,
        amount,
        jetton: asset.master,
        text: bin ? undefined : d.text.trim() || undefined,
        bin,
        exp: d.exp ?? undefined
      }
    : null
  return { request, asset, errors, warnings }
}

/** Draft prefilled from a parsed link / query (for cross-tool links). */
export function draftFromLink(l: ParsedLink): PaymentDraft {
  const r = l.request
  const d = emptyDraft()
  d.to = r.to
  d.text = r.text ?? ''
  d.bin = r.bin ?? ''
  d.exp = r.exp ?? null
  let decimals = COIN_DECIMALS
  if (r.jetton) {
    const k = knownJetton(r.jetton)
    if (k) {
      d.asset = k.master
      decimals = k.decimals
    }
    else {
      d.asset = CUSTOM_ASSET
      d.customJetton = r.jetton
      decimals = l.extras.decimals ?? 9
      d.decimals = String(decimals)
    }
  }
  if (r.amount !== undefined) d.amount = formatUnits(r.amount, decimals)
  return d
}
