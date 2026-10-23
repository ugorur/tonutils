import { Address } from '@ton/core'
import type { TcAddressBook, TcDnsRecord, TcNftItem } from '~/lib/dns-read/api'

const raw = (a: string) => Address.parse(a).toRawString()

export interface PointingName {
  domain: string
  item: string
  /** Raw owner of the domain NFT (null while in auction). */
  owner: string | null
  ownedBySelf: boolean
}

export interface OwnedName {
  domain: string
  item: string
  /** Its wallet record points back at this address. */
  pointsHere: boolean
}

export interface ReverseResult {
  /** The name explorers and wallets display for this address (toncenter address book). */
  primary: string | null
  pointing: PointingName[]
  ownedTon: OwnedName[]
  ownedUsernames: OwnedName[]
}

/** Combines toncenter dns/records?wallet=, nft/items (owner × .ton / usernames collection) and the address book. */
export function buildReverse(address: string, records: TcDnsRecord[], ton: TcNftItem[], usernames: TcNftItem[], book: TcAddressBook): ReverseResult {
  const self = raw(address)
  const pointing = records
    .filter(r => r.dns_wallet && raw(r.dns_wallet) === self)
    .map(r => {
      const owner = r.nft_item_owner ? raw(r.nft_item_owner) : null
      return { domain: r.domain, item: raw(r.nft_item_address), owner, ownedBySelf: owner === self }
    })
    .sort((a, b) => Number(b.ownedBySelf) - Number(a.ownedBySelf) || a.domain.localeCompare(b.domain))
  const pointed = new Set(pointing.map(p => p.domain))
  const owned = (items: TcNftItem[]) => items
    .map(i => ({ domain: i.content?.domain ?? '', item: raw(i.address), pointsHere: pointed.has(i.content?.domain ?? '') }))
    .filter(o => o.domain)
    .sort((a, b) => a.domain.localeCompare(b.domain))
  const entry = Object.entries(book).find(([k]) => raw(k) === self)
  return { primary: entry?.[1].domain ?? null, pointing, ownedTon: owned(ton), ownedUsernames: owned(usernames) }
}

/** fragment.com page of a .t.me username. */
export const fragmentUrl = (domain: string) => `https://fragment.com/username/${encodeURIComponent(domain.replace(/\.t\.me$/, ''))}`
