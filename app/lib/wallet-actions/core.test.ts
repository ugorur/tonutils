import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { TonapiAccount, TonapiJettonBalance } from './core'
import { chooseBounce, chunk, maxMessages, parseRecipient, recipientNotes, signDataTypes, sortJettons, toOwnedJetton } from './core'

// Account snapshots from tonapi.io /v2/accounts/{id} (mainnet, read 2026-10-22).
const BINANCE: TonapiAccount = {
  address: '0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4',
  status: 'active',
  interfaces: ['wallet_v3r2'],
  name: 'Binance',
  is_scam: false,
  memo_required: true,
  is_wallet: true
}
const USDT_MASTER_ACC: TonapiAccount = {
  address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe',
  status: 'active',
  interfaces: ['jetton_master'],
  name: 'Tether USD',
  is_scam: false,
  memo_required: false,
  is_wallet: false
}
const NEVER_USED: TonapiAccount = {
  address: '0:1111111111111111111111111111111111111111111111111111111111111111',
  status: 'uninit',
  interfaces: [],
  is_wallet: true
}
// A USD₮ jetton wallet: tonapi reports governed wallets as `jetton_wallet_governed` (read 2026-10-23).
const USDT_JETTON_WALLET: TonapiAccount = {
  address: '0:0000005cecbdc23e9fe415d530adee667ef35b4d3db4cc49088b4f319179a86f',
  status: 'active',
  interfaces: ['jetton_wallet_governed'],
  is_wallet: false
}
const ctx = { comment: '', testnet: false, typedTestOnly: null }
const levels = (n: { level: string }[]) => n.map(x => x.level)

describe('parseRecipient', () => {
  it('reads the bounce and test-only flags of user-friendly addresses', () => {
    // TON Foundation wallet, as tonapi /v2/address/{id}/parse returns it.
    const b = parseRecipient('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')
    expect(b).toMatchObject({ kind: 'address', bounceable: true, testOnly: false })
    const nb = parseRecipient(' UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI ')
    expect(nb).toMatchObject({ kind: 'address', bounceable: false, testOnly: false })
    if (b.kind === 'address' && nb.kind === 'address') expect(b.address.equals(nb.address)).toBe(true)
    // Testnet form, verified with toncenter /api/v2/detectAddress (test_only: true).
    expect(parseRecipient('0QDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPleK')).toMatchObject({ kind: 'address', bounceable: false, testOnly: true })
  })
  it('accepts raw addresses (no bounce flag) and names', () => {
    const r = parseRecipient('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(r).toMatchObject({ kind: 'address', bounceable: null })
    expect(parseRecipient('Foundation.TON')).toEqual({ kind: 'domain', domain: 'foundation.ton' })
    expect(parseRecipient('durov.t.me')).toEqual({ kind: 'domain', domain: 'durov.t.me' })
    expect(parseRecipient('')).toEqual({ kind: 'empty' })
    expect(parseRecipient('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2X').kind).toBe('invalid') // bad checksum
    expect(parseRecipient('hello').kind).toBe('invalid')
  })
})

describe('chooseBounce', () => {
  it('sends to never-used accounts non-bounceable, even when typed as EQ…', () => {
    expect(chooseBounce(true, 'uninit')).toEqual({ bounceable: false, autofixed: true })
    expect(chooseBounce(null, 'nonexist')).toEqual({ bounceable: false, autofixed: false })
    expect(chooseBounce(false, 'uninit')).toEqual({ bounceable: false, autofixed: false })
  })
  it('keeps the typed flag for deployed accounts, defaulting to bounceable', () => {
    expect(chooseBounce(false, 'active')).toEqual({ bounceable: false, autofixed: false })
    expect(chooseBounce(null, 'active')).toEqual({ bounceable: true, autofixed: false })
    expect(chooseBounce(null, 'frozen')).toEqual({ bounceable: true, autofixed: false })
  })
})

describe('recipientNotes', () => {
  const binance = Address.parse(BINANCE.address)
  it('warns when an exchange that requires a memo gets none', () => {
    expect(levels(recipientNotes(binance, BINANCE, { ...ctx, purpose: 'coin' }))).toEqual(['warning'])
    expect(recipientNotes(binance, BINANCE, { ...ctx, purpose: 'coin', comment: '174343631' })).toEqual([])
  })
  it('blocks sending tokens to a token contract', () => {
    const n = recipientNotes(Address.parse(USDT_MASTER_ACC.address), USDT_MASTER_ACC, { ...ctx, purpose: 'jetton' })
    expect(levels(n)).toEqual(['error'])
  })
  it('blocks sending tokens to a governed (USD₮) jetton wallet', () => {
    const n = recipientNotes(Address.parse(USDT_JETTON_WALLET.address), USDT_JETTON_WALLET, { ...ctx, purpose: 'jetton' })
    expect(levels(n)).toEqual(['error'])
  })
  it('blocks the zero address and flags testnet-only addresses on mainnet', () => {
    expect(levels(recipientNotes(new Address(0, Buffer.alloc(32)), null, { ...ctx, purpose: 'coin' }))).toEqual(['error'])
    expect(levels(recipientNotes(binance, null, { ...ctx, purpose: 'coin', typedTestOnly: true }))).toEqual(['warning'])
  })
  it('explains never-used wallets and the bounce auto-fix', () => {
    const n = recipientNotes(Address.parse(NEVER_USED.address), NEVER_USED, { ...ctx, purpose: 'coin', autofixed: true })
    expect(levels(n)).toEqual(['info'])
    expect(n[0]!.text).toContain('non-bounceable')
  })
})

describe('jetton balances (tonapi /v2/accounts/{id}/jettons)', () => {
  // Two entries of TON Foundation's list, mainnet 2026-10-22.
  const raw: TonapiJettonBalance[] = [
    { balance: '1000000000', wallet_address: { address: '0:da4ecce819f637e2fd7fb8ee26c406088db2df84205f215eec6b88611cbb91fd' }, jetton: { address: '0:749ed6c9ecda14f077203687f24327e609bc959decff92b36166f4097e8d9183', name: 'Nova BIT', symbol: 'NVB', decimals: 9, verification: 'blacklist' } },
    { balance: '1100000', wallet_address: { address: '0:99277a41a11e70704b4e16c4af2fd435edac72e41f9e3992c4f2efafd050bf9a' }, jetton: { address: '0:729c13b6df2c07cbf0a06ab63d34af454f3d320ec1bcd8fb5c6d24d0806a17c2', name: 'jUSDT', symbol: 'jUSDT', decimals: 6, verification: 'whitelist' } }
  ]
  it('maps and sorts verified first, spam last', () => {
    const list = sortJettons(raw.map(toOwnedJetton))
    expect(list.map(j => j.symbol)).toEqual(['jUSDT', 'NVB'])
    expect(list[0]).toMatchObject({ decimals: 6, balance: 1_100_000n, needsClaim: false, locked: 0n })
  })
  it('flags mintless jettons that still need a claim', () => {
    expect(toOwnedJetton({ ...raw[0]!, extensions: ['custom_payload'] }).needsClaim).toBe(true)
  })
})

describe('wallet features (TonConnect device.features)', () => {
  it('reads maxMessages and signData types, with the spec defaults', () => {
    const tonkeeper = ['SendTransaction', { name: 'SendTransaction', maxMessages: 255, extraCurrencySupported: true }, { name: 'SignData', types: ['text', 'binary', 'cell'] }]
    expect(maxMessages(tonkeeper)).toBe(255)
    expect(signDataTypes(tonkeeper)).toEqual(['text', 'binary', 'cell'])
    expect(maxMessages(['SendTransaction'])).toBe(4)
    expect(signDataTypes(['SendTransaction'])).toEqual([])
  })
  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
