import { describe, expect, it } from 'vitest'
import { accountKind, fiatValue, formatFiat, formatPercent, friendly, isDomainName, mergeStates, parseAccountList, parseDiff, pickRate, timeAgo, toRaw } from './core'
import type { TonapiAccount, ToncenterWalletStates } from './core'
import { addToWatchlist, loadWatchlist, saveWatchlist } from './watchlist'

// TON Foundation (OLD) wallet. Raw form from tonapi /v2/accounts/EQCD39…, non-bounceable form from
// toncenter v3 address_book (both fetched 2026-10-22).
const TF = {
  bounceable: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
  nonBounceable: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI',
  raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8'
}
const USDT = { friendly: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', raw: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe' }
const NONEXIST = '0:1234567812345678123456781234567812345678123456781234567812345678'

// toncenter v3 /walletStates?address=NONEXIST&address=TF&address=USDT (2026-10-22), trimmed.
const TC: ToncenterWalletStates = {
  wallets: [
    { address: '0:83DFD552E63729B472FCBCC8C45EBCC6691702558B68EC7527E1BA403A0F31A8', is_wallet: true, wallet_type: 'wallet v3 r2', seqno: 343, wallet_id: 698983191, balance: '1592542221079555', status: 'active', code_hash: 'hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=', last_transaction_hash: '10beCuKo9PUZEz6P/6NcvPePRnh8BPumR+7KzQOZyPU=', last_transaction_lt: '109633787000015' },
    { address: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', is_wallet: false, balance: '1073000516641', status: 'active', code_hash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=', last_transaction_hash: 'WxtqdX1G09tMMGFkyMKfjifxbFQ+1iYjqoUBtQEBEo8=', last_transaction_lt: '111666651000036' }
  ],
  address_book: {
    '0:83DFD552E63729B472FCBCC8C45EBCC6691702558B68EC7527E1BA403A0F31A8': { user_friendly: TF.nonBounceable, domain: null, interfaces: ['wallet_v3r2'] },
    '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE': { user_friendly: USDT.friendly, domain: null, interfaces: ['jetton_master'] }
  }
}
// tonapi POST /v2/accounts/_bulk {account_ids:[NONEXIST, TF]} (2026-10-22).
const TA: TonapiAccount[] = [
  { address: NONEXIST, balance: 0, last_activity: 0, status: 'nonexist', is_wallet: true },
  { address: TF.raw, balance: 1592542221079555, last_activity: 1791870707, status: 'active', interfaces: ['wallet_v3r2'], name: 'TON Foundation (OLD)', is_scam: false, memo_required: false, is_wallet: true }
]

describe('addresses', () => {
  it('normalizes every form to lowercase raw', () => {
    expect(toRaw(TF.bounceable)).toBe(TF.raw)
    expect(toRaw(TF.nonBounceable)).toBe(TF.raw)
    expect(toRaw(TF.raw.toUpperCase())).toBe(TF.raw)
    expect(toRaw(USDT.friendly)).toBe(USDT.raw)
  })
  it('shows wallets non-bounceable and contracts bounceable', () => {
    expect(friendly(TF.raw)).toBe(TF.nonBounceable)
    expect(friendly(USDT.raw, { wallet: false })).toBe(USDT.friendly)
  })
  it('recognizes .ton and .t.me names', () => {
    expect(isDomainName('foundation.ton')).toBe(true)
    expect(isDomainName('Sub.Foundation.TON')).toBe(true)
    expect(isDomainName('durov.t.me')).toBe(true)
    expect(isDomainName(TF.bounceable)).toBe(false)
    expect(isDomainName('foundation')).toBe(false)
  })
})

describe('parseAccountList', () => {
  it('handles a CSV with header, labels, names, duplicates and typos', () => {
    const rows = parseAccountList([
      'address,label',
      `${TF.bounceable},TON Foundation`,
      '',
      `${USDT.friendly};USDT master`,
      'foundation.ton',
      `"${TF.raw}"`,
      'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBX',
      'hello world'
    ].join('\n'))
    expect(rows).toHaveLength(6)
    expect(rows[0]).toEqual({ line: 2, input: TF.bounceable, label: 'TON Foundation', raw: TF.raw })
    expect(rows[1]).toMatchObject({ line: 4, raw: USDT.raw, label: 'USDT master' })
    expect(rows[2]).toMatchObject({ line: 5, domain: 'foundation.ton' })
    expect(rows[2]!.raw).toBeUndefined()
    expect(rows[3]).toMatchObject({ line: 6, raw: TF.raw, duplicateOf: 2 })
    expect(rows[4]!.error).toMatch(/valid TON address/)
    expect(rows[5]).toMatchObject({ line: 8, error: 'No address on this line' })
  })
  it('accepts whitespace separated lists without a header', () => {
    const rows = parseAccountList(`${TF.raw}\t${USDT.friendly}`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ raw: TF.raw, label: USDT.friendly })
  })
})

describe('mergeStates', () => {
  it('combines toncenter and tonapi data', () => {
    const [none, tf, usdt] = mergeStates([NONEXIST, TF.raw, USDT.raw], TC, TA)
    expect(tf).toMatchObject({ status: 'active', balance: 1592542221079555n, isWallet: true, kind: 'Wallet v3R2', seqno: 343, walletId: 698983191, name: 'TON Foundation (OLD)', isScam: false, lastActivity: 1791870707, lastTxLt: '109633787000015' })
    expect(usdt).toMatchObject({ status: 'active', balance: 1073000516641n, isWallet: false, kind: 'Jetton master', interfaces: ['jetton_master'] })
    expect(usdt!.name).toBeUndefined()
    expect(none).toMatchObject({ status: 'nonexist', balance: 0n, kind: 'Never used', lastActivity: undefined })
  })
  it('keeps exact balances above 2^53 (TON Believers Fund locker)', () => {
    // toncenter v3 walletStates, 0:ED16… balance "1245901672547880944"; tonapi sends it as a JSON number.
    const raw = '0:ed1691307050047117b998b561d8de82d31fbf84910ced6eb5fc92e7485ef8a7'
    const [s] = mergeStates([raw], { wallets: [{ address: raw.toUpperCase(), is_wallet: false, balance: '1245901672547880944', status: 'active' }], address_book: { [raw.toUpperCase()]: { user_friendly: '', domain: null, interfaces: ['locker'] } } }, [{ address: raw, balance: 1245901672547880944, last_activity: 1792596519, status: 'active', name: 'TON Believers Fund' }])
    expect(s!.balance).toBe(1245901672547880944n)
    expect(s!.kind).toBe('Locker')
    expect(s!.name).toBe('TON Believers Fund')
  })
  it('still works when tonapi failed', () => {
    const [tf] = mergeStates([TF.raw], TC, null)
    expect(tf).toMatchObject({ balance: 1592542221079555n, kind: 'Wallet v3R2', name: undefined })
  })
  it('labels by code hash before toncenter wallet_type', () => {
    expect(accountKind({ status: 'active', walletType: 'wallet v5 r1' })).toBe('Wallet v5r1')
    expect(accountKind({ status: 'active', codeHash: 'IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=' })).toBe('Wallet W5 (v5R1)')
    expect(accountKind({ status: 'uninit' })).toBe('Not deployed yet')
  })
})

describe('prices', () => {
  // tonapi /v2/rates?tokens=ton&currencies=usd,eur (2026-10-22).
  const rates = { prices: { USD: 1.3258057, EUR: 1.1826444050305802 }, diff_24h: { USD: '−2.51%', EUR: '−2.35%' }, diff_7d: { USD: '−3.72%', EUR: '−3.72%' }, diff_30d: { EUR: '−6.29%', USD: '−8.68%' } }
  it('parses tonapi diffs with a Unicode minus', () => {
    expect(parseDiff('−2.51%')).toBe(-2.51)
    expect(parseDiff('+1.20%')).toBe(1.2)
    expect(parseDiff('0.00%')).toBe(0)
    expect(parseDiff(undefined)).toBeUndefined()
  })
  it('picks one currency', () => {
    expect(pickRate(rates, 'USD')).toEqual({ price: 1.3258057, diff24h: -2.51, diff7d: -3.72, diff30d: -8.68 })
    expect(pickRate(rates, 'TRY')).toBeUndefined()
  })
  it('values exact amounts', () => {
    // 1592542.221079555 GRAM * 1.3258057 = 2111401.5541979345 (computed independently in Python)
    expect(fiatValue(1592542221079555n, 9, 1.3258057)).toBeCloseTo(2111401.5541979345, 6)
    expect(fiatValue(1500000n, 6, 0.9999)).toBeCloseTo(1.49985, 10)
  })
  it('formats', () => {
    expect(formatFiat(2111401.5541979345, 'USD')).toBe('$2,111,401.55')
    expect(formatFiat(0.00123, 'EUR')).toBe('€0.00123')
    expect(formatFiat(3.1109746725378824e-06, 'USD')).toBe('$0.00000311')
    expect(formatFiat(0, 'USD')).toBe('$0.00')
    expect(formatPercent(-2.51)).toBe('-2.51%')
    expect(formatPercent(3)).toBe('+3.00%')
  })
})

describe('timeAgo', () => {
  const now = 1_800_000_000_000
  it('formats relative times', () => {
    expect(timeAgo(undefined, now)).toBe('—')
    expect(timeAgo(1_800_000_000 - 30, now)).toBe('just now')
    expect(timeAgo(1_800_000_000 - 300, now)).toBe('5 min ago')
    expect(timeAgo(1_800_000_000 - 3 * 86400, now)).toBe('3 days ago')
    expect(timeAgo(1_800_000_000 - 800 * 86400, now)).toBe('2 years ago')
  })
})

describe('watchlist storage', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }
  it('round-trips per network and skips duplicates and junk', () => {
    const s = mem()
    const { items, added } = addToWatchlist([], [{ raw: TF.raw, label: 'TF' }, { raw: TF.raw, label: 'again' }, { raw: USDT.raw, label: '' }], 1)
    expect(added).toBe(2)
    saveWatchlist('mainnet', items, s)
    expect(loadWatchlist('mainnet', s).map(i => i.raw)).toEqual([TF.raw, USDT.raw])
    expect(loadWatchlist('testnet', s)).toEqual([])
    s.setItem('tonutils:watchlist:testnet', '[{"raw":"nope"},{"raw":"0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8","label":5}]')
    expect(loadWatchlist('testnet', s)).toEqual([{ raw: TF.raw, label: '5' }])
    s.setItem('tonutils:watchlist:testnet', '{bad json')
    expect(loadWatchlist('testnet', s)).toEqual([])
  })
})
