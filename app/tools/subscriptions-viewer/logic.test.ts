import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import type { TonapiSubscription } from './logic'
import { formatPeriod, formatPrice, mergeSubscriptions, readPlugins, riskSummary } from './logic'

// Wallet code from @ton/ton's own wrappers (v4R2 / W5 v5R1 / v3R2); wallet data read live from mainnet on
// 2026-10-23 with toncenter GET /api/v3/account.
const key = Buffer.alloc(32, 1)
const code = (w: { init: { code: { toBoc: () => Buffer } } }) => w.init.code.toBoc().toString('base64')
const V4 = code(WalletContractV4.create({ workchain: 0, publicKey: key }))
const V5 = code(WalletContractV5R1.create({ workchain: 0, publicKey: key }))
const V3 = code(WalletContractV3R2.create({ workchain: 0, publicKey: key }))

// pewpewgogo.ton, UQAt_V50zZzQW7hjFtqaj20ZPnN7fp4F5X_cKQWxkt_DMBS4 (wallet v4 r2, seqno 2996 per toncenter walletStates).
// Its plugin 0:21c1…2d92 is the source of the "plug" (0x706c7567) payment requests toncenter lists for this wallet
// (GET /api/v3/messages?opcode=0x706c7567).
const PEW_DATA = 'te6ccgEBAgEAUQABUQAAC7QpqaMX3qniTKfyymzGI+XdvWrOvNRAiAOYpRyNmgTAEmA5IBbAAQBFoQAEOCRh/TPykkZ8sgLGOIKz4GbO96KhCmJJxHHx0KpFslA='
const PEW_PLUGIN = '0:21c1230fe99f949233e5901631c4159f033677bd150853124e238f8e85522d92'
// valuegifts.ton, UQCxO74ltwmfB68XAWK7i39bdeSet35HU3GfO9BHNA4adeDI (wallet v5 r1, is_signature_allowed false per
// toncenter walletStates). Its extension 0:b167…934a sends it "extn" (0x6578746e) action requests.
const VG_DATA = 'te6ccgEBAgEAUAABUQAAABG///+IwB8DyUzgxo0WH1m80Mql/ZHIo3M/ALxnHiz2h8MoaDTgAQBDoBYs5sgJzxZZKJXtkcbGam2sj+AGM1RHfbVb9qW+UBJpWA=='
const VG_EXT = '0:b16736404e78b2c944af6c8e3633536d647f00319aa23bedaadfb52df280934a'

// tonapi GET /v2/accounts/0:2dfd…c330/subscriptions on 2026-10-23 (metadata omitted).
const PEW_SUBS: TonapiSubscription[] = [{
  type: 'v2',
  status: 'active',
  period: 2592000,
  subscription_id: '375714130',
  payment_per_period: { currency_type: 'native', value: '6990000000', decimals: 9, token_name: 'Gram' },
  next_charge_at: 1795310731,
  address: '0:21c1230fe99f949233e5901631c4159f033677bd150853124e238f8e85522d92',
  beneficiary: { address: '0:b16a061860c9f389d4ef41fdfdaa7914bc09167db9f5377b5ea95c504ed76b77', name: 'Tonkeeper Pro Subscriptions' }
}]

describe('readPlugins', () => {
  it('reads the v4 plugin list from real wallet data', () => {
    expect(readPlugins(V4, PEW_DATA, 0)).toEqual({ version: 'v4r2', label: expect.any(String), kind: 'plugins', addresses: [PEW_PLUGIN] })
  })
  it('reads W5 extensions and the signature flag from real wallet data', () => {
    const p = readPlugins(V5, VG_DATA, 0)
    expect(p).toMatchObject({ version: 'v5r1', kind: 'extensions', signatureAllowed: false, addresses: [VG_EXT] })
  })
  it('reports wallets without plugin support and unknown contracts', () => {
    // A fresh v3R2 StateInit data cell from @ton/ton.
    const v3 = WalletContractV3R2.create({ workchain: 0, publicKey: key })
    expect(readPlugins(V3, v3.init.data.toBoc().toString('base64'), 0)).toMatchObject({ version: 'v3r2', kind: 'none', addresses: [] })
    const fresh = WalletContractV4.create({ workchain: 0, publicKey: key })
    expect(readPlugins(V4, fresh.init.data.toBoc().toString('base64'), 0).addresses).toEqual([])
    expect(readPlugins(PEW_DATA, PEW_DATA, 0).kind).toBe('unknown')
  })
})

describe('merge and summary', () => {
  it('matches installed plugins with tonapi subscriptions', () => {
    const p = readPlugins(V4, PEW_DATA, 0)
    const rows = mergeSubscriptions(p, [...PEW_SUBS, { ...PEW_SUBS[0]!, status: 'cancelled', subscription_id: '1', address: '0:3920452a7d564da515df88ce33537fc2fd1b6851d67d874e95683da8d0adc052' }])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ address: PEW_PLUGIN, installed: true, sub: { subscription_id: '375714130' } })
    expect(rows[1]).toMatchObject({ installed: false, sub: { status: 'cancelled' } })
    expect(riskSummary(p, rows)).toMatchObject({ risk: 'ok', title: '1 active subscription' })
  })
  it('warns about unknown extensions and a disabled key', () => {
    const v5 = readPlugins(V5, VG_DATA, 0)
    expect(riskSummary(v5, mergeSubscriptions(v5, [])).risk).toBe('danger')
    const v5ok = { ...v5, signatureAllowed: true }
    expect(riskSummary(v5ok, mergeSubscriptions(v5ok, [])).risk).toBe('warn')
    const none = readPlugins(V4, WalletContractV4.create({ workchain: 0, publicKey: key }).init.data.toBoc().toString('base64'), 0)
    expect(riskSummary(none, []).title).toBe('Nothing can pull funds from this wallet')
  })
  it('formats price and period', () => {
    expect(formatPrice(PEW_SUBS[0]!.payment_per_period)).toBe('6.99 GRAM')
    expect(formatPrice({ currency_type: 'jetton', value: '5000000', decimals: 6, token_name: 'USD₮' })).toBe('5 USD₮')
    expect(formatPeriod(2592000)).toBe('every 30 days')
    expect(formatPeriod(604800)).toBe('every week')
    expect(formatPeriod(3600)).toBe('every 1 h')
  })
})

describe('W5 beta extensions', () => {
  it('reads key and workchain per the @ton/ton W5 beta layout', async () => {
    const { WalletContractV5Beta } = await import('@ton/ton')
    const { beginCell, Dictionary } = await import('@ton/core')
    const w = WalletContractV5Beta.create({ walletId: { networkGlobalId: -239 }, publicKey: key })
    // @ton/ton's fresh data ends with an empty extensions dict (one 0 bit); swap in a one-entry dict.
    const s = w.init.data.beginParse()
    const head = s.loadBits(s.remainingBits - 1)
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.BigInt(8)).set(BigInt(`0x${VG_EXT.slice(2)}`), -1n)
    const data = beginCell().storeBits(head).storeDict(dict).endCell().toBoc().toString('base64')
    expect(readPlugins(w.init.code.toBoc().toString('base64'), data, 0)).toMatchObject({ version: 'v5beta', kind: 'extensions', signatureAllowed: true, addresses: [`-1:${VG_EXT.slice(2)}`] })
  })
})
