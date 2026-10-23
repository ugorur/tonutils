// Who can take money from a wallet without a new signature: v4 plugins and W5 extensions read from the wallet's
// own data, matched with tonapi's subscription list. Pure TS (imports @ton/core).
import { Address, Cell, Dictionary } from '@ton/core'
import { formatAmount } from '~/utils/units'
import { COIN_SYMBOL } from '~/utils/currency'
import { detectWalletVersion } from '~/utils/ton/wallets'

export interface WalletPlugins {
  version: string | null
  label: string
  /** plugins: wallet v4; extensions: W5; none: wallet type without plugin support; unknown: not a known wallet. */
  kind: 'plugins' | 'extensions' | 'none' | 'unknown'
  /** W5 only: false means the owner's key can no longer sign; only extensions control the wallet. */
  signatureAllowed?: boolean
  /** Raw addresses (0:hex, lowercase). */
  addresses: string[]
}

/** Dict values carry no data (v4 plugins: empty, W5 extensions: int1). */
const PRESENT = { serialize: () => {}, parse: () => true }

/** Reads the plugin / extension list straight from the wallet's persistent data. Layouts: ton-blockchain/wallet-contract (v4), wallet-contract-v5, @ton/ton W5 beta. */
export function readPlugins(codeB64: string, dataB64: string | null, workchain: number): WalletPlugins {
  const code = Cell.fromBase64(codeB64)
  const kind = detectWalletVersion(code.hash().toString('base64'))
  if (!kind) return { version: null, label: 'Not a known wallet contract', kind: 'unknown', addresses: [] }
  const base = { version: kind.version, label: kind.label }
  if (!dataB64) return { ...base, kind: 'none', addresses: [] }
  const s = Cell.fromBase64(dataB64).beginParse()
  const hex = (b: Buffer) => b.toString('hex')
  switch (kind.version) {
    case 'v4r1': case 'v4r2': {
      s.skip(32 + 32 + 256) // seqno, subwallet_id, public_key
      const d = s.loadDict(Dictionary.Keys.Buffer(33), PRESENT) // key: wc int8 ++ addr hash
      return { ...base, kind: 'plugins', addresses: d.keys().map(k => `${k.readInt8(0)}:${hex(k.subarray(1))}`) }
    }
    case 'v5r1': {
      const signatureAllowed = s.loadBit()
      s.skip(32 + 32 + 256) // seqno, wallet_id, public_key
      const d = s.loadDict(Dictionary.Keys.Buffer(32), PRESENT)
      return { ...base, kind: 'extensions', signatureAllowed, addresses: d.keys().map(k => `${workchain}:${hex(k)}`) }
    }
    case 'v5beta': {
      const signatureAllowed = s.preloadInt(33) >= 0 // beta stores a negative seqno once signature auth is off
      s.skip(33 + 32 + 8 + 8 + 32 + 256) // seqno, wallet_id (net, wc, version, subwallet), public_key
      const d = s.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.BigInt(8)) // value: the extension's workchain
      return { ...base, kind: 'extensions', signatureAllowed, addresses: [...d].map(([k, wc]) => `${wc}:${hex(k)}`) }
    }
    default:
      return { ...base, kind: 'none', addresses: [] }
  }
}

/** Subset of tonapi GET /v2/accounts/{id}/subscriptions items that we show. */
export interface TonapiSubscription {
  type: string
  status: 'not_ready' | 'active' | 'suspended' | 'cancelled' | string
  period: number
  subscription_id: string
  payment_per_period: { currency_type?: string, value: string, decimals: number, token_name?: string }
  next_charge_at: number
  address?: string
  beneficiary?: { address: string, name?: string, is_scam?: boolean }
  admin?: { address: string, name?: string }
}

export interface PullerRow {
  /** Raw address of the plugin / extension / subscription contract. */
  address: string
  /** Installed in the wallet right now (it can pull funds). */
  installed: boolean
  sub?: TonapiSubscription
}

const norm = (a: string) => {
  try {
    return Address.parse(a).toRawString().toLowerCase()
  }
  catch {
    return a.toLowerCase()
  }
}

/** Installed plugins/extensions first (with their subscription details when tonapi knows them), then past subscriptions. */
export function mergeSubscriptions(onchain: WalletPlugins, subs: TonapiSubscription[]): PullerRow[] {
  const byAddr = new Map(subs.filter(s => s.address).map(s => [norm(s.address!), s]))
  const rows: PullerRow[] = onchain.addresses.map(a => ({ address: a, installed: true, sub: byAddr.get(norm(a)) }))
  const seen = new Set(rows.map(r => norm(r.address)))
  for (const s of subs) {
    const a = s.address ? norm(s.address) : `sub:${s.subscription_id}`
    if (seen.has(a)) continue
    seen.add(a)
    rows.push({ address: s.address ? a : '', installed: false, sub: s })
  }
  return rows
}

/** "every 30 days", "every week", "every 1 h". */
export function formatPeriod(sec: number): string {
  if (sec % 86400 === 0) {
    const d = sec / 86400
    return d === 1 ? 'every day' : d === 7 ? 'every week' : `every ${d} days`
  }
  if (sec % 3600 === 0) return `every ${sec / 3600} h`
  return `every ${sec} s`
}

/** "6.99 GRAM" for native payments, "<amount> <token>" otherwise. */
export function formatPrice(p: TonapiSubscription['payment_per_period']): string {
  const native = !p.currency_type || p.currency_type === 'native'
  return `${formatAmount(BigInt(p.value), p.decimals)} ${native ? COIN_SYMBOL : (p.token_name ?? '')}`.trim()
}

export type Risk = 'danger' | 'warn' | 'ok'
/** Overall summary for the banner. */
export function riskSummary(p: WalletPlugins, rows: PullerRow[]): { risk: Risk, title: string, text: string } {
  const installed = rows.filter(r => r.installed)
  const unknown = installed.filter(r => !r.sub)
  if (p.signatureAllowed === false) {
    return { risk: 'danger', title: 'Your key cannot sign for this wallet', text: 'Signature authentication is turned off: only its extensions can move funds. If you did not do this on purpose (some apps do, e.g. for delegated control), treat the wallet as compromised.' }
  }
  if (unknown.length) {
    return { risk: 'warn', title: `${unknown.length} ${p.kind === 'extensions' ? 'extension' : 'plugin'}${unknown.length > 1 ? 's' : ''} without a known subscription`, text: 'These contracts can take funds from this wallet without asking you again. If you do not recognise them, move your funds to a new wallet.' }
  }
  if (installed.length) {
    return { risk: 'ok', title: `${installed.length} active subscription${installed.length > 1 ? 's' : ''}`, text: 'Each one can charge the amount shown on its schedule. Cancel the ones you no longer use.' }
  }
  if (p.kind === 'unknown') return { risk: 'warn', title: 'Not a standard wallet', text: 'This address is not a known wallet contract, so its plugins cannot be read.' }
  return { risk: 'ok', title: 'Nothing can pull funds from this wallet', text: p.kind === 'none' ? `${p.label} wallets do not support plugins or extensions.` : `No ${p.kind} installed: every transfer needs your signature.` }
}
