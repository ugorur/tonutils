import { Address } from '@ton/core'
import { explorerLinks, type ExplorerKind, type ExplorerLink } from '~/utils/ton/explorers'

export type Network = 'mainnet' | 'testnet'

export interface SwitchResult {
  kind: ExplorerKind
  /** Where the input came from: an explorer name (or the host of an unknown site), or 'plain' for a bare value. */
  source: string
  /** Network named by the link (host or testnet address form), or null when the input does not say. */
  network: Network | null
  /** Address-like kinds: the parsed address. */
  address?: { raw: string, bounceable: string, nonBounceable: string, bounceableFlag: boolean | null }
  /** Transactions: the hash in hex, base64 and base64url. */
  tx?: { hex: string, base64: string, base64url: string }
}

const HOSTS: Record<string, string> = {
  'tonviewer.com': 'Tonviewer',
  'tonscan.org': 'Tonscan',
  'tonscan.com': 'tonscan.com',
  'dton.io': 'dton.io',
  'tonwhales.com': 'Tonwhales',
  'explorer.toncoin.org': 'explorer.toncoin.org',
  'getgems.io': 'Getgems',
  'ton.cx': 'ton.cx',
  'tonapi.io': 'tonapi.io',
  'toncoin.org': 'explorer.toncoin.org'
}

function hostInfo(host: string): { name: string, network: Network | null } {
  const h = host.toLowerCase().replace(/^www\./, '')
  const testnet = /^(testnet|test)[.-]/.test(h) || h.includes('testnet')
  const base = h.replace(/^(testnet|test)[.-]/, '')
  const known = HOSTS[base] ?? HOSTS[base.split('.').slice(-2).join('.')]
  // A known explorer's plain host is its mainnet site; an unknown site says nothing about the network.
  return { name: known ?? base, network: testnet ? 'testnet' : known ? 'mainnet' : null }
}

/** 32-byte hash from hex, base64 or base64url (also tolerates '+' turned into a space by URL decoding). */
export function parseHash(s: string): Uint8Array | null {
  const t = s.trim().replace(/ /g, '+').replace(/^0x/i, '')
  if (/^[0-9a-f]{64}$/i.test(t)) return Uint8Array.from(t.match(/../g)!, b => Number.parseInt(b, 16))
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(t)) {
    try {
      const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/').padEnd(44, '='))
      if (bin.length === 32) return Uint8Array.from(bin, c => c.charCodeAt(0))
    }
    catch { /* not base64 */ }
  }
  return null
}

function txForms(bytes: Uint8Array): NonNullable<SwitchResult['tx']> {
  const base64 = btoa(String.fromCharCode(...bytes))
  return {
    hex: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''),
    base64,
    base64url: base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}

function parseAddress(s: string): { address: Address, bounceable: boolean | null, testOnly: boolean | null } | null {
  let p: { address: Address, bounceable: boolean | null, testOnly: boolean | null } | null = null
  try {
    if (Address.isRaw(s)) p = { address: Address.parseRaw(s), bounceable: null, testOnly: null }
    else if (Address.isFriendly(s)) {
      const f = Address.parseFriendly(s)
      p = { address: f.address, bounceable: f.isBounceable, testOnly: f.isTestOnly }
    }
  }
  catch { /* not an address */ }
  // Only workchains 0 and -1 exist; explorers have no page for anything else.
  return p && (p.address.workChain === 0 || p.address.workChain === -1) ? p : null
}

/** A hash inside one URL part, also when it carries an lt or address: "lt_hash", "lt:hash:addr". */
function hashIn(part: string): Uint8Array | null {
  return parseHash(part) ?? part.split(/[:_]/).map(parseHash).find(Boolean) ?? null
}

const TX_WORDS = new Set(['tx', 'transaction', 'transactions', 'trace', 'traces'])
const KIND_WORDS: Record<string, ExplorerKind> = { nft: 'nft', collection: 'collection', jetton: 'jetton', jettons: 'jetton' }

function addressResult(p: NonNullable<ReturnType<typeof parseAddress>>, kind: ExplorerKind, source: string, network: Network | null): SwitchResult {
  const a = p.address
  return {
    kind,
    source,
    network: network === 'testnet' || p.testOnly ? 'testnet' : network,
    address: {
      raw: a.toRawString(),
      bounceable: a.toString({ bounceable: true, urlSafe: true }),
      nonBounceable: a.toString({ bounceable: false, urlSafe: true }),
      bounceableFlag: p.bounceable
    }
  }
}

/** Reads an explorer link (any TON explorer), or a bare address / transaction hash. Throws a user-facing Error. */
export function parseExplorerInput(input: string): SwitchResult {
  const s = input.trim()
  if (!s) throw new Error('Paste an explorer link, an address or a transaction hash')

  // Bare values first: an address or a hash is not a link.
  const bare = parseAddress(s)
  if (bare) return addressResult(bare, 'address', 'plain', null)
  const bareHash = parseHash(s)
  if (bareHash) return { kind: 'tx', source: 'plain', network: null, tx: txForms(bareHash) }

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
    if (!url.hostname.includes('.')) throw new Error('no host')
  }
  catch {
    throw new Error('Not a link, address or transaction hash.')
  }
  const host = hostInfo(url.hostname)
  const network = host.network
  const segments = url.pathname.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p)
    }
    catch {
      return p
    }
  })
  // Hash routes (#/address/…) used by some explorers.
  segments.push(...url.hash.replace(/^#!?\/?/, '').split('/').filter(Boolean))
  const query = [...url.searchParams.entries()]

  // Transactions: the part after tx/transaction(s), a ?hash= parameter, or tonwhales' "<lt>_<hash>".
  const txAt = segments.findIndex(p => TX_WORDS.has(p.toLowerCase()))
  const txCandidates = [
    ...(txAt >= 0 ? [segments.slice(txAt + 1).join('/'), ...segments.slice(txAt + 1)] : []),
    ...query.filter(([k]) => /hash|tx/i.test(k)).map(([, v]) => v),
    ...segments.filter(p => p.includes('_') && !parseAddress(p))
  ]
  for (const c of txCandidates) {
    const h = c && hashIn(c)
    if (h) return { kind: 'tx', source: host.name, network, tx: txForms(h) }
  }

  // Addresses, NFTs, collections, jettons.
  const found = [...segments, ...query.map(([, v]) => v.replace(/ /g, '+'))]
    .map((p, i) => ({ i, p: parseAddress(p) }))
    .filter((x): x is { i: number, p: NonNullable<ReturnType<typeof parseAddress>> } => !!x.p)
  const kindAt = segments.findIndex(p => KIND_WORDS[p.toLowerCase()])
  if (kindAt >= 0) {
    // ".../<owner>/jetton/<master>" or Getgems ".../collection/<collection>/<item>": the address after the word wins.
    let kind = KIND_WORDS[segments[kindAt]!.toLowerCase()]!
    const after = found.filter(x => x.i > kindAt)
    if (kind === 'collection' && after.length > 1) {
      kind = 'nft'
      after.shift()
    }
    const pick = after[0] ?? found[0]
    if (pick) return addressResult(pick.p, kind, host.name, network)
  }
  if (found[0]) return addressResult(found[0].p, 'address', host.name, network)

  const name = segments.find(p => /\.(ton|t\.me)$/i.test(p))
  if (name) throw new Error(`This link uses the name ${name}, not an address. Open it once in the explorer, copy the address it resolves to, and paste that here.`)
  throw new Error('No TON address or transaction hash found in this link.')
}

/** Links for the parsed value on every explorer that supports it. */
export function switchLinks(r: SwitchResult, network: Network, bounceable: boolean): ExplorerLink[] {
  if (r.tx) return explorerLinks('tx', r.tx.hex, network)
  const a = Address.parseRaw(r.address!.raw)
  const value = a.toString({ bounceable, testOnly: network === 'testnet', urlSafe: true })
  // An NFT, collection or user address also has a Getgems page.
  const ids = r.kind === 'address' ? ['tonviewer', 'tonscan', 'tonscan-com', 'getgems'] as const : undefined
  return explorerLinks(r.kind, value, network, ids ? [...ids] : undefined)
}
