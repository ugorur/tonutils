// Vectors: real mainnet data saved from tonapi.io and toncenter.com on 2026-10-22 (fixtures/), cross-checked
// between the two providers, plus CoinGecko for prices and contract sources for exit codes.
import { describe, expect, it } from 'vitest'
import type { TaEvent, TaEventsPage } from './events'
import { assetLabel, describeAction, friendlyAddress, rawAddress, shortAmount, viewerFee } from './events'
import { explainExitCode } from './exit-codes'
import { parseTxInput } from './hash'
import type { RatePoint } from './rates'
import { fiatValue, priceAt, rateWindows } from './rates'
import usdtEvent from './fixtures/tonapi-account-event-usdt.json'
import swapperPage from './fixtures/tonapi-account-events-swapper.json'
import nftEvent from './fixtures/tonapi-account-event-nft.json'
import chart from './fixtures/tonapi-rates-ton-usd-180d.json'
import failedTrace from './fixtures/toncenter-trace-failed.json'

const SWAPPER = 'UQA1oZvigoavK2fWe1imzZKmoAx6GlzHA0efVqJFNYJ6Mwtx'
const USDT_SENDER = '0:ffea881bad41a5b1b60f17f6ba57091a86999cf7f091b56e9149543c191d2021'

describe('parseTxInput', () => {
  // toncenter v3 returns this tx hash as base64; tonapi returns the same tx as hex event id.
  const hex = 'ba0b99e961985275cad28e5aa1f356655774a9b5a77bb529e042e5f2398d2d15'
  it.each([
    [hex, hex],
    [hex.toUpperCase(), hex],
    [`0x${hex}`, hex],
    ['uguZ6WGYUnXK0o5aofNWZVd0qbWne7Up4ELl8jmNLRU=', hex],
    ['uguZ6WGYUnXK0o5aofNWZVd0qbWne7Up4ELl8jmNLRU', hex],
    [`https://tonviewer.com/transaction/${hex}`, hex],
    [`https://tonscan.org/tx/${encodeURIComponent('uguZ6WGYUnXK0o5aofNWZVd0qbWne7Up4ELl8jmNLRU=')}`, hex],
    // base64url form of toncenter's W3+ieVL5… (tonapi event 5b7fa279… for the same tx)
    ['https://tonscan.org/tx/W3-ieVL5LywIzjXyf56z5NyH84pDFV_l0xWS8LCm14g=', '5b7fa27952f92f2c08ce35f27f9eb3e4dc87f38a43155fe5d31592f0b0a6d788'],
    [`tonscan.com/transactions/${hex}`, hex]
  ])('%s', (input, expected) => {
    expect(parseTxInput(input)).toBe(expected)
  })

  it('rejects addresses and junk', () => {
    expect(() => parseTxInput('')).toThrow(/Paste/)
    expect(() => parseTxInput('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')).toThrow(/Not a hash/)
    expect(() => parseTxInput('https://tonviewer.com/EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')).toThrow(/No transaction hash/)
  })
})

describe('explainExitCode', () => {
  it('TVM and action phase codes (Tact docs table)', () => {
    expect(explainExitCode(0, 'compute').ok).toBe(true)
    expect(explainExitCode(9, 'compute').title).toMatch(/Cell underflow/)
    expect(explainExitCode(-14, 'compute').title).toMatch(/Out of gas/)
    expect(explainExitCode(37, 'action').title).toMatch(/Not enough balance/)
    expect(explainExitCode(37, 'action').source).toBe('Action phase')
  })

  it('contract codes depend on the contract', () => {
    // stablecoin-contract op-codes.fc: error::balance_error = 47, error::not_enough_gas = 48
    expect(explainExitCode(47, 'compute', ['jetton_wallet_governed']).title).toMatch(/Not enough jettons/)
    expect(explainExitCode(48, 'compute', ['jetton_wallet_governed']).title).toMatch(/Not enough value/)
    // token-contract jetton-wallet.fc: throw_unless(706, balance >= 0), throw_unless(709, msg_value > …)
    expect(explainExitCode(706, 'compute', ['jetton_wallet']).title).toMatch(/Not enough jettons/)
    expect(explainExitCode(709, 'compute', ['jetton_wallet']).title).toMatch(/Not enough value/)
    // wallet-v4-code.fc: throw_if(36, valid_until <= now()); wallet_v5.fc: error::invalid_seqno = 133
    expect(explainExitCode(36, 'compute', ['wallet_v4r2']).title).toMatch(/expired/)
    expect(explainExitCode(133, 'compute', ['wallet_v5r1']).title).toMatch(/seqno/)
    // wallet-code.fc (v2): throw_unless(34, check_signature(...)); wallet3-code.fc: throw_unless(34, subwallet_id == stored_subwallet)
    expect(explainExitCode(34, 'compute', ['wallet_v2r2']).title).toMatch(/signature/)
    expect(explainExitCode(34, 'compute', ['wallet_v3r2']).title).toMatch(/subwallet/)
    expect(explainExitCode(65535, 'compute').title).toMatch(/Unknown operation/)
    expect(explainExitCode(1234, 'compute').source).toBe('Contract-specific')
  })
})

describe('describeAction (tonapi events)', () => {
  it('outgoing USD₮ transfer, amount and decimals match toncenter jetton/transfers (1792846, 6 decimals)', () => {
    const v = describeAction((usdtEvent as unknown as TaEvent).actions[0]!, USDT_SENDER)
    expect(v.kind).toBe('send')
    expect(v.title).toBe('Sent 1.7928 USD₮')
    expect(v.flows).toEqual([{ asset: expect.objectContaining({ symbol: 'USD₮', decimals: 6, master: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe' }), amount: -1792846n }])
    // toncenter address_book: receiver 0:4D46… is UQBNRk0gCO_voi7Q6fTpj2QF-GI2vqVQPFVEiGHgTUwX2aHK
    expect(friendlyAddress(v.counterparty!.address, true)).toBe('UQBNRk0gCO_voi7Q6fTpj2QF-GI2vqVQPFVEiGHgTUwX2aHK')
  })

  it('same action seen by the receiver and by nobody', () => {
    const a = (usdtEvent as unknown as TaEvent).actions[0]!
    expect(describeAction(a, 'UQBNRk0gCO_voi7Q6fTpj2QF-GI2vqVQPFVEiGHgTUwX2aHK').title).toBe('Received 1.7928 USD₮')
    expect(describeAction(a).title).toBe('Transfer of 1.7928 USD₮')
    expect(describeAction(a).flows[0]!.amount).toBe(1792846n)
  })

  it('swap on STON.fi (tonapi preview: "Swapping 40.9 USD₮ for 30.7 Gram")', () => {
    const ev = (swapperPage as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('53da68a1'))!
    const v = describeAction(ev.actions[0]!, SWAPPER)
    expect(v.kind).toBe('swap')
    expect(v.title).toBe('Swapped 40.9894 USD₮ for 30.714 GRAM on STON.fi')
    expect(v.flows.map(f => [f.asset.symbol, f.amount])).toEqual([['USD₮', -40989487n], ['GRAM', 30714023583n]])
  })

  it('failed jetton transfer moves nothing; the refund is a receive', () => {
    const ev = (swapperPage as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('b492e6f6'))!
    const [failed, refund] = ev.actions.map(a => describeAction(a, SWAPPER))
    expect(failed!.ok).toBe(false)
    expect(failed!.flows).toEqual([])
    expect(failed!.value?.amount).toBe(172717947n)
    expect(refund!.title).toBe('Received 0.1698 GRAM')
    expect(refund!.flows[0]!.amount).toBe(169866665n)
  })

  it('received NFT', () => {
    const v = describeAction((nftEvent as unknown as TaEvent).actions[0]!, '0:fd7860a648e8bc934f2f69855f3e2e6b1bbdb3de01fb2fa1c798135f7ac39372')
    expect(v.kind).toBe('nft')
    expect(v.title).toBe('Received an NFT')
    expect(v.nft).toBe('0:05978a95e6568c466cf3a0a59d399b7ae7b7ea8690fe3a6c5b71bad23014934e')
  })

  it('helpers', () => {
    expect(rawAddress(SWAPPER)).toBe('0:35a19be28286af2b67d67b58a6cd92a6a00c7a1a5cc703479f56a24535827a33')
    expect(shortAmount(1n, 9)).toBe('0.000000001')
    expect(shortAmount(-30714023583n, 9)).toBe('30.714')
    expect(assetLabel(1_000_000n, { symbol: 'USD₮', decimals: 6 })).toBe('1 USD₮')
  })
})

describe('rates', () => {
  const points = chart.points as RatePoint[]

  it('tonapi daily price matches CoinGecko history for 2026-10-01 (1.499237 USD) within 1%', () => {
    const p = priceAt(points, Date.parse('2026-10-01T00:00:00Z') / 1000)!
    expect(Math.abs(p - 1.499237357046854) / 1.499237357046854).toBeLessThan(0.01)
  })

  it('no price when the nearest point is too far away', () => {
    expect(priceAt(points, Date.parse('2020-01-01T00:00:00Z') / 1000)).toBeNull()
    expect(priceAt([], 1)).toBeNull()
  })

  it('180-day windows cover the range', () => {
    const now = 1_800_000_000
    const w = rateWindows(now - 400 * 86400, now - 10, now)
    expect(w).toHaveLength(3)
    expect(w[0]).toEqual([now - 180 * 86400, now])
    expect(w.at(-1)![0]).toBeLessThan(now - 401 * 86400)
    expect(rateWindows(now - 86400, now - 3600, now)).toHaveLength(1)
  })

  it('fiat value is exact to the cent', () => {
    expect(fiatValue(30714023583n, 9, 1.5)).toBe(46.07)
    expect(fiatValue(-1792846n, 6, 1)).toBe(1.79)
  })
})

describe('viewerFee', () => {
  it('failed jetton transfer: the bounce is a refund and the fee is the wallet\'s real loss on toncenter', () => {
    // toncenter trace: wallet sends 170000000 (fwd_fee 111780, total_fees 478503), gets 169866665 back (total_fees 44601).
    const txs = Object.values(failedTrace.traces[0]!.transactions).filter(t => t.account === rawAddress(SWAPPER).toUpperCase())
    const net = txs.reduce((s, t) => s - BigInt(t.total_fees) + (t.in_msg?.source ? BigInt(t.in_msg.value!) : 0n)
      - t.out_msgs.reduce((o, m) => o + BigInt(m.value!) + BigInt(m.fwd_fee!), 0n), 0n)
    const ev = (swapperPage as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('b492e6f6'))!
    const views = ev.actions.map(a => describeAction(a, SWAPPER))
    expect(viewerFee(ev, views, SWAPPER)).toEqual({ fee: -net, otherIn: 0n })
    expect(-net).toBe(768219n)
    expect(views[1]!.title).toBe('Refund of 0.1698 GRAM (bounced)')
    expect(views[1]!.flows).toEqual([])
  })

  it('successful events keep incoming transfers as income', () => {
    const ev = (swapperPage as unknown as TaEventsPage).events.find(e => e.event_id.startsWith('53da68a1'))!
    const views = ev.actions.map(a => describeAction(a, SWAPPER))
    expect(viewerFee(ev, views, SWAPPER).fee).toBe(4621112n)
    expect(views[0]!.flows).toHaveLength(2)
  })
})
