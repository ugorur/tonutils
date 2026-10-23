import { describe, expect, it } from 'vitest'
import type { TaEvent } from '~/lib/tx-user/events'
import poisoned from './fixtures/events-poisoned.json'
import poisoner from './fixtures/events-poisoner.json'
import spammed from './fixtures/events-spammed.json'
import bounced from './fixtures/events-bounced.json'
import { detectPoisoning, friendlyOf, impersonates, isSpamSender, loadLabels, rawOf, scamTextReason, senderProfile, sortChecks, visibleMatch, worst } from './core'

const VICTIM = rawOf('UQA1eUxtUXQM0J3E53ydRKcCJIJWOI2prdCKY6UguqGeekpE')!
const REAL = 'UQB7ofZ_NC0tqu9HGlngAi_TZrd3ajfd3HFp6Gz2JUgiw7ja'
const FAKE = 'UQBqc8IJqOnIKKN78FLxTEFRi7mtisxNiIQ_80EiFBYWw7ja'

describe('visibleMatch', () => {
  it('matches the poisoner to the real counterparty on the shown ending', () => {
    // Both end in "w7ja" in UQ form and share the "B" after the tag.
    expect(visibleMatch(FAKE, REAL)).toEqual({ bounceable: false, prefix: 1, suffix: 4 })
    // Another look-alike from the same history ends in "t7ja": 3 characters.
    expect(visibleMatch('UQC37jR2-IzS04CFlmlGFwtcGAxie7og5lt3sNO3YmbZt7ja', REAL)?.suffix).toBe(3)
  })
  it('does not match unrelated or identical addresses', () => {
    expect(visibleMatch('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N', REAL)).toBeNull()
    expect(visibleMatch(REAL, rawOf(REAL)!)).toBeNull()
  })
})

describe('detectPoisoning (real history of a poisoned wallet)', () => {
  const r = detectPoisoning(poisoned.events as unknown as TaEvent[], VICTIM)
  it('groups the look-alikes under the real address you sent to', () => {
    expect(r.events).toBe(100)
    const g = r.groups.find(x => x.real.raw === rawOf(REAL))!
    expect(g).toBeDefined()
    expect(g.real.sent).toBeGreaterThanOrEqual(5)
    const fakes = g.fakes.map(f => friendlyOf(f.cp.raw))
    expect(fakes).toContain(FAKE)
    expect(fakes).toContain('UQC37jR2-IzS04CFlmlGFwtcGAxie7og5lt3sNO3YmbZt7ja')
    expect(fakes.every(f => f.endsWith('7ja'))).toBe(true)
    expect(g.fakes.length).toBeGreaterThanOrEqual(15)
    // the real counterparty is never listed as a fake
    expect(fakes).not.toContain(REAL)
  })
  it('lists other spam senders separately', () => {
    const spam = r.junkSenders.map(c => friendlyOf(c.raw))
    expect(spam).toContain('UQCwJnvwWYIo_FhHqkL3hjmApNLWFqAea4aSn5nKNd7oebpY') // "Crypto-fiat wallet non-KYC" 1 nanoGRAM
    expect(spam).not.toContain(FAKE)
    // "…nLTja" shares only "ja" with "…w7ja": too weak to call a look-alike, so it stays a plain dust sender
    expect(spam).toContain('UQDkQgjO4TdVnhuI9cm8YNJP4vFMCPBp8ViiZdmVVZ_nLTja')
    expect(r.scamEvents).toBeGreaterThan(0)
  })
})

describe('detectPoisoning (spammed wallet that never sends)', () => {
  it('finds no look-alikes when there is nothing real to imitate', () => {
    const viewer = rawOf('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')!
    const r = detectPoisoning(spammed.events as unknown as TaEvent[], viewer)
    expect(r.groups).toEqual([])
    expect(r.junkSenders.length).toBeGreaterThan(5)
  })
})

describe('senderProfile', () => {
  it('flags the poisoner: only dust out, several recipients', () => {
    const p = senderProfile(poisoner.events as unknown as TaEvent[], rawOf(FAKE)!)
    expect(p.realOut).toBe(0)
    expect(p.junkOut).toBeGreaterThanOrEqual(8)
    expect(p.recipients).toBe(2) // a third transfer (to UQCmZW…) failed on-chain and is not counted
    expect(isSpamSender(p)).toBe(true)
  })
  it('does not flag the victim, who sends real value', () => {
    const p = senderProfile(poisoned.events as unknown as TaEvent[], VICTIM)
    expect(p.realOut).toBeGreaterThan(0)
    expect(isSpamSender(p)).toBe(false)
  })
})

describe('bounces are not transfers', () => {
  // Real testnet history of an uninit address: 12 bounceable 0.001 transfers from 0:b111a976… each bounce
  // back (933333 nano) inside the same event. Counting the bounces made it look like a dust spammer.
  const ME = rawOf('EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb')!
  it('an uninit wallet that bounces dust is not a spam sender', () => {
    const p = senderProfile(bounced.events as unknown as TaEvent[], ME)
    expect(p).toMatchObject({ junkOut: 0, realOut: 0, recipients: 0 })
    expect(isSpamSender(p)).toBe(false)
  })
  it('the bounced sender is a dust sender, not someone the wallet paid', () => {
    const r = detectPoisoning(bounced.events as unknown as TaEvent[], ME, true)
    const market = r.junkSenders.find(c => c.raw === '0:b111a976236e3b5e990a250406098be60ea7c1a242cd4055a774b106dab968e7')
    expect(market).toMatchObject({ sent: 0, junkIn: 12 })
  })
})

describe('scamTextReason', () => {
  it('catches real scam token names and comments', () => {
    // tonapi-blacklisted jetton symbols and real spam comments from the fixtures above
    expect(scamTextReason('GRAM AT GRAMEVENT.ORG')).toMatch(/link/)
    expect(scamTextReason('TONNEL 💎 Unlock at TONNEL.ME')).toMatch(/link/)
    expect(scamTextReason('Bonus from t.me/TomsGiveawayBot')).toMatch(/link/)
    expect(scamTextReason('🎁 You’ve received 118 GRAM!')).toMatch(/bait/)
  })
  it('leaves normal names alone', () => {
    for (const s of ['Tether USD', 'Notcoin', 'Make Gram Great Again', 'Tonstakers TON', 'player-11', undefined]) expect(scamTextReason(s)).toBeNull()
  })
})

describe('checks', () => {
  it('worst and sort', () => {
    const c = [{ level: 'ok' as const, title: 'a' }, { level: 'danger' as const, title: 'b' }, { level: 'warn' as const, title: 'c' }]
    expect(worst(c)).toBe('danger')
    expect(sortChecks(c).map(x => x.title)).toEqual(['b', 'c', 'a'])
    expect(worst([])).toBe('ok')
  })
})

describe('impersonates', () => {
  it('flags famous tickers on other contracts and coin-named tokens', () => {
    expect(impersonates('USD₮', rawOf('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')!)).toBeNull() // the real USD₮ master
    expect(impersonates('USDT', '0:aac11fc890fbd314f0fb6b57b8041862c3e2002362c1de1c9410502d45e5ca12')).toMatch(/Tether/)
    expect(impersonates('$NOT', '0:1111111111111111111111111111111111111111111111111111111111111111')).toMatch(/Notcoin/)
    expect(impersonates('GRAM', '0:19e5bc74a0a2445fec46c632ac597932feda8168f860c0f02dffe21ee2d3340f')).toMatch(/native coin/)
    expect(impersonates('MGRMGA', '0:e7b6133a0e364b22543f950942c2d8fe133d94ad8ce9594578f776dc71ccfe46')).toBeNull()
  })
})

describe('loadLabels', () => {
  it('maps raw addresses to names and memo flags (entries copied from tonkeeper/ton-assets accounts.json)', async () => {
    const list = [
      { address: '0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4', name: 'Binance', require_memo: true },
      { address: '0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309', name: 'Binance Hot Wallet' }
    ]
    const m = await loadLabels((async () => new Response(JSON.stringify(list))) as typeof fetch)
    expect(m.get(rawOf('EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb')!)).toEqual({ name: 'Binance', memo: true })
    expect(m.get('0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309')).toEqual({ name: 'Binance Hot Wallet', memo: false })
  })
})
