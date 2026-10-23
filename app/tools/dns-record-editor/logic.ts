import type { Cell } from '@ton/core'
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { RecordCategory } from '~/lib/dns-write/dns'
import {
  adnlRecord, changeRecordBody, EDIT_AMOUNT, nextResolverRecord, parseBytes32, parseRecord, RECORD_KEYS, storageRecord, walletRecord
} from '~/lib/dns-write/dns'
import { convertAdnl } from '~/tools/adnl-address-converter/logic'

/** Editable form. Empty string = no record. The site can point to an ADNL (TON Site on a server) or a TON Storage bag. */
export interface RecordForm {
  wallet: string
  siteType: 'adnl' | 'storage'
  site: string
  storage: string
  resolver: string
}

export const CATEGORY_LABEL: Record<RecordCategory, string> = {
  wallet: 'Wallet',
  site: 'TON Site',
  storage: 'TON Storage',
  dns_next_resolver: 'Subdomain resolver'
}

/** Form values from the item's current records (addresses in friendly form). Records of an unknown shape show as empty. */
export function formFromRecords(records: Map<bigint, Cell>, testOnly: boolean): RecordForm {
  const f: RecordForm = { wallet: '', siteType: 'adnl', site: '', storage: '', resolver: '' }
  const rec = (k: RecordCategory) => {
    const c = records.get(RECORD_KEYS[k])
    return c ? parseRecord(c) : null
  }
  const w = rec('wallet')
  if (w?.type === 'wallet') f.wallet = w.address.toString({ bounceable: false, testOnly, urlSafe: true })
  const s = rec('site')
  if (s?.type === 'adnl') f.site = s.hex
  if (s?.type === 'storage') {
    f.siteType = 'storage'
    f.site = s.hex
  }
  const st = rec('storage')
  if (st?.type === 'storage') f.storage = st.hex
  const r = rec('dns_next_resolver')
  if (r?.type === 'next_resolver') f.resolver = r.address.toString({ bounceable: true, testOnly, urlSafe: true })
  return f
}

export interface RecordChange {
  category: RecordCategory
  /** null deletes the record. */
  value: Cell | null
  summary: string
}

function parseAddr(v: string, what: string): Address {
  try {
    return Address.parse(v.trim())
  }
  catch {
    throw new Error(`${what}: not a valid TON address`)
  }
}

/** The record cell a field produces, or null when empty. Throws a readable error for bad input. */
export function recordValue(category: RecordCategory, f: RecordForm): Cell | null {
  switch (category) {
    case 'wallet':
      return f.wallet.trim() ? walletRecord(parseAddr(f.wallet, 'Wallet')) : null
    case 'dns_next_resolver':
      return f.resolver.trim() ? nextResolverRecord(parseAddr(f.resolver, 'Subdomain resolver')) : null
    case 'storage': {
      if (!f.storage.trim()) return null
      const b = parseBytes32(f.storage)
      if (!b) throw new Error('TON Storage: the bag ID is 64 hex characters')
      return storageRecord(b)
    }
    case 'site': {
      if (!f.site.trim()) return null
      if (f.siteType === 'storage') {
        const b = parseBytes32(f.site)
        if (!b) throw new Error('TON Site: the bag ID is 64 hex characters')
        return storageRecord(b)
      }
      try {
        return adnlRecord(Buffer.from(convertAdnl(f.site).hex, 'hex'))
      }
      catch (e) {
        throw new Error(`TON Site: ${(e as Error).message}`)
      }
    }
  }
}

const CATEGORIES: RecordCategory[] = ['wallet', 'site', 'storage', 'dns_next_resolver']

const fieldKey = (c: RecordCategory, f: RecordForm) =>
  c === 'wallet' ? f.wallet.trim() : c === 'storage' ? f.storage.trim() : c === 'dns_next_resolver' ? f.resolver.trim() : `${f.siteType}:${f.site.trim()}`

/**
 * Records the user edited (vs `initial`, the form loaded from chain) whose new cell differs from the one on chain.
 * Untouched fields never produce a change, so records this form cannot show in full (e.g. capability lists) are left alone.
 */
export function planChanges(current: Map<bigint, Cell>, initial: RecordForm, form: RecordForm): { changes: RecordChange[], errors: string[] } {
  const changes: RecordChange[] = []
  const errors: string[] = []
  for (const category of CATEGORIES) {
    if (fieldKey(category, initial) === fieldKey(category, form)) continue
    let value: Cell | null
    try {
      value = recordValue(category, form)
    }
    catch (e) {
      errors.push((e as Error).message)
      continue
    }
    const now = current.get(RECORD_KEYS[category]) ?? null
    if (value && now ? value.hash().equals(now.hash()) : value === now) continue
    changes.push({ category, value, summary: `${value ? (now ? 'Change' : 'Set') : 'Remove'} ${CATEGORY_LABEL[category]}` })
  }
  return { changes, errors }
}

/** One change_dns_record message per change, bounceable to the item. */
export function editMessages(item: Address, changes: RecordChange[], testOnly: boolean, queryId = 0n): TonConnectMessage[] {
  const address = item.toString({ bounceable: true, testOnly, urlSafe: true })
  return changes.map(c => ({ address, amount: EDIT_AMOUNT, payload: changeRecordBody(RECORD_KEYS[c.category], c.value, queryId) }))
}
