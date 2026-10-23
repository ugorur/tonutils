import { ADNLAddress, Address } from '@ton/core'
import type { TcDnsRecord } from '~/lib/dns-read/api'
import { b64ToHex, cleanName, nameError } from '~/lib/dns-read/core'

/** "Foundation.ton" → { name: 'foundation', error: '' }. */
export function parseDomain(input: string): { name: string, error: string } {
  const name = cleanName(input)
  return { name, error: input.trim() ? nameError(name) : '' }
}

export interface RecordRow {
  key: 'wallet' | 'site' | 'storage' | 'resolver'
  label: string
  /** Raw address for wallet/resolver, hex for site/storage. */
  value: string
  hint: string
  /** 55-char .adnl form of a site record. */
  adnl?: string
}

/** The records a domain publishes, in a fixed order; missing ones are left out. */
export function recordRows(r: TcDnsRecord | null | undefined): RecordRow[] {
  if (!r) return []
  const rows: RecordRow[] = []
  if (r.dns_wallet) rows.push({ key: 'wallet', label: 'Wallet', value: Address.parse(r.dns_wallet).toRawString(), hint: 'Where wallets send coins when you pay to this name.' })
  if (r.dns_site_adnl) {
    const hex = b64ToHex(r.dns_site_adnl)
    rows.push({ key: 'site', label: 'TON Site (ADNL)', value: hex, adnl: new ADNLAddress(Buffer.from(hex, 'hex')).toString(), hint: 'Server that hosts the site when you open the name in a TON-enabled browser.' })
  }
  if (r.dns_storage_bag_id) rows.push({ key: 'storage', label: 'TON Storage bag', value: b64ToHex(r.dns_storage_bag_id), hint: 'Site files served from TON Storage.' })
  if (r.dns_next_resolver) rows.push({ key: 'resolver', label: 'Subdomain resolver', value: Address.parse(r.dns_next_resolver).toRawString(), hint: 'Contract that answers for subdomains like sub.name.ton.' })
  return rows
}

/** tonapi /v2/dns/{domain}/bids item. */
export interface TaBid {
  success: boolean
  value: number
  txTime: number
  txHash: string
  bidder: { address: string, name?: string }
}

export interface BidRow {
  time: number
  amount: bigint
  bidder: string
  bidderName?: string
  ok: boolean
  txHash: string
}

/** Newest first. Failed bids (too low, too late) are kept and flagged. */
export function bidRows(bids: TaBid[]): BidRow[] {
  return bids
    .map(b => ({ time: b.txTime, amount: BigInt(b.value), bidder: b.bidder.address, bidderName: b.bidder.name, ok: b.success, txHash: b.txHash }))
    .sort((a, b) => b.time - a.time)
}
