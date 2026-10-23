import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import accounts from '~/lib/security/fixtures/accounts.json'
import poisoned from '~/lib/security/fixtures/events-poisoned.json'
import poisoner from '~/lib/security/fixtures/events-poisoner.json'
import { counterparties, rawOf, senderProfile } from '~/lib/security/core'
import type { TaEvent } from '~/lib/tx-user/events'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { compareWithHistory, type PreflightInput, preflight, recommendedForm } from './logic'

// accounts.json: real tonapi /v2/accounts responses; events-*.json: real tonapi event pages (see _source).
const acc = (k: keyof typeof accounts) => accounts[k] as unknown as TonapiAccount
const base = (address: string, account: TonapiAccount | null, over: Partial<PreflightInput> = {}): PreflightInput => {
  const f = Address.isFriendly(address) ? Address.parseFriendly(address) : { address: Address.parse(address), isBounceable: null, isTestOnly: null }
  return { address: f.address, typedBounceable: f.isBounceable, typedTestOnly: f.isTestOnly, domain: null, account, testnet: false, purpose: 'coin', ...over }
}
const titles = (i: PreflightInput) => preflight(i).map(c => `${c.level}: ${c.title}`)

describe('preflight with real accounts', () => {
  it('Binance deposit wallet: known name, memo required', () => {
    const t = titles(base('EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb', acc('binance_deposit')))
    expect(t).toContain('ok: Known as “Binance”')
    expect(t).toContain('warn: Binance requires a comment (memo)')
    expect(t).toContain('ok: This is a wallet (wallet v3r2)')
  })
  it('zero address is a burn address', () => {
    expect(titles(base('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ', acc('zero')))).toContain('danger: This is the zero (burn) address')
  })
  it('bounceable form to a never-used address: bounce trap + UQ suggestion', () => {
    const fresh = Address.parse(accounts.nonexist.address)
    const eq = fresh.toString({ bounceable: true })
    const i = base(eq, acc('nonexist'))
    const t = titles(i)
    expect(t).toContain('info: Never used yet (not activated)')
    expect(t.some(x => x.startsWith('warn: Bounceable form to an inactive address'))).toBe(true)
    expect(recommendedForm(i)).toEqual({ address: fresh.toString({ bounceable: false }), bounceable: false })
  })
  it('jetton wallet, token master, scam collection', () => {
    expect(titles(base(accounts.jetton_wallet.address, acc('jetton_wallet'))).some(t => t.startsWith('danger: This is a jetton wallet'))).toBe(true)
    expect(titles(base('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', acc('usdt_master'), { purpose: 'jetton' }))).toContain('danger: This is a token contract (jetton master), not a wallet')
    const scam = titles(base(accounts.scam_collection.address, acc('scam_collection')))
    expect(scam).toContain('danger: Flagged as a scam by tonapi (Tonkeeper)')
  })
  it('contracts get the bounceable form, raw input on a wallet gets UQ', () => {
    expect(recommendedForm(base(accounts.stonfi_router.address, acc('stonfi_router'))).bounceable).toBe(true)
    expect(recommendedForm(base(accounts.w5_wallet.address, acc('w5_wallet'))).bounceable).toBe(false)
  })
  it('testnet-only form on mainnet', () => {
    const kq = Address.parse(accounts.w5_wallet.address).toString({ bounceable: false, testOnly: true })
    expect(titles(base(kq, acc('w5_wallet')))).toContain('warn: This is a testnet-only address (0Q…/kQ…)')
  })
})

describe('poisoning signals', () => {
  const FAKE = 'UQBqc8IJqOnIKKN78FLxTEFRi7mtisxNiIQ_80EiFBYWw7ja'
  const victimCps = counterparties(poisoned.events as unknown as TaEvent[], rawOf('UQA1eUxtUXQM0J3E53ydRKcCJIJWOI2prdCKY6UguqGeekpE')!)
  it('the poisoner is flagged from its own activity', () => {
    const profile = senderProfile(poisoner.events as unknown as TaEvent[], rawOf(FAKE)!)
    expect(titles(base(FAKE, acc('poisoner'), { profile }))).toContain('danger: Behaves like a spam or address-poisoning sender')
  })
  it('the victim\'s history exposes the fake and confirms the real one', () => {
    const h = compareWithHistory(Address.parse(FAKE), victimCps)
    expect(h.junkOnly).toBe(true)
    expect(h.sentBefore).toBe(false)
    expect(h.lookalike?.raw).toBe(rawOf('UQB7ofZ_NC0tqu9HGlngAi_TZrd3ajfd3HFp6Gz2JUgiw7ja'))
    const t = titles(base(FAKE, acc('poisoner'), { history: h }))
    expect(t).toContain('danger: Looks like an address you paid before, but it is a different one')
    expect(t).toContain('danger: This address only ever sent you dust or spam')

    const real = compareWithHistory(Address.parse('UQB7ofZ_NC0tqu9HGlngAi_TZrd3ajfd3HFp6Gz2JUgiw7ja'), victimCps)
    expect(real).toEqual({ sentBefore: true, junkOnly: false, lookalike: null })
  })
})
