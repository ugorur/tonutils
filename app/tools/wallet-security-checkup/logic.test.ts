import { describe, expect, it } from 'vitest'
import accounts from '~/lib/security/fixtures/accounts.json'
import poisoned from '~/lib/security/fixtures/events-poisoned.json'
import { detectPoisoning, rawOf } from '~/lib/security/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import type { TaEvent } from '~/lib/tx-user/events'
import type { TonapiAccount, TonapiJettonBalance } from '~/lib/wallet-actions/core'
import { inspectAccount } from '~/lib/wallet-detection/state'
import nftFixture from '../spam-nft-cleaner/fixtures.json'
import fx from './fixtures.json'
import { checkup, type CheckupInput, listField } from './logic'

// Real on-chain state and tonapi responses (see _source in each fixture).
const titles = (i: CheckupInput) => checkup(i).map(c => `${c.level}: ${c.title}`)
const empty: CheckupInput = { account: null, report: null, jettons: null, nfts: null, poison: null, expiring: null, subscriptions: null }

describe('wallet contract data', () => {
  it('W5 wallet: up to date, signature allowed, no extensions', () => {
    const report = inspectAccount(fx.w5.code, fx.w5.data, { workchain: 0, testOnly: false })
    expect(report.wallet?.version).toBe('v5r1')
    expect(listField(report.data?.fields, 'Extensions')).toEqual([])
    expect(listField(report.data?.fields, 'Plugins')).toBeNull()
    const t = titles({ ...empty, account: accounts.w5_wallet as unknown as TonapiAccount, report })
    expect(t).toEqual(['ok: Up-to-date wallet (W5 (v5R1))', 'ok: No extensions installed'])
  })
  it('v4r2 wallet without plugins', () => {
    const report = inspectAccount(fx.v4.code, fx.v4.data, { workchain: 0, testOnly: false })
    expect(listField(report.data?.fields, 'Plugins')).toEqual([])
    expect(titles({ ...empty, account: accounts.poisoner as unknown as TonapiAccount, report })).toEqual(['ok: Wallet v4R2', 'ok: No plugins installed'])
  })
  it('flags extensions, disabled signature and plugins from the parsed data fields', () => {
    const report = inspectAccount(fx.w5.code, fx.w5.data, { workchain: 0, testOnly: false })
    const fields = [
      { label: 'Signature allowed', value: 'No' },
      { label: 'Extensions', value: `0:${'ab'.repeat(32)}` },
      { label: 'Plugins', value: `0:${'cd'.repeat(32)}\n0:${'ef'.repeat(32)}` }
    ]
    const t = titles({ ...empty, account: accounts.w5_wallet as unknown as TonapiAccount, report: { ...report, data: { publicKey: null, seqno: 1, fields } } })
    expect(t).toContain('danger: Signing with your key is disabled')
    expect(t).toContain('warn: 1 extension can send from this wallet without your signature')
    expect(t).toContain('warn: 2 plugins can withdraw from this wallet')
  })
})

describe('holdings and history', () => {
  it('counts the 15 tonapi-blacklisted tokens plus unverified ones with links in their names', () => {
    const t = checkup({ ...empty, jettons: fx.tf_jettons as unknown as TonapiJettonBalance[] })
    const c = t.find(x => x.title.includes('scam token'))!
    expect(c.level).toBe('warn')
    // 15 blacklisted + "TONNEL 💎 Unlock at TONNEL.ME" (unverified, link in symbol) at least
    expect(Number(c.title.split(' ')[0])).toBeGreaterThanOrEqual(16)
  })
  it('scam NFTs from the spam-nft-cleaner fixture (36 on tonapi\'s blacklist)', () => {
    const t = checkup({ ...empty, nfts: nftFixture.items as unknown as TonapiNft[] })
    const c = t.find(x => x.title.includes('NFT'))!
    expect(Number(c.title.split(' ')[0])).toBeGreaterThanOrEqual(36)
    expect(c.link?.to).toBe('/tools/spam-nft-cleaner')
  })
  it('poisoning and expiring domains', () => {
    const poison = detectPoisoning(poisoned.events as unknown as TaEvent[], rawOf('UQA1eUxtUXQM0J3E53ydRKcCJIJWOI2prdCKY6UguqGeekpE')!)
    // foundation.ton expires 1796149277, solanasucks.ton 1795171812
    const t = titles({ ...empty, poison, expiring: fx.expiring, now: 1795171812 - 40 * 86400 })
    expect(t.some(x => /^danger: \d+ look-alike addresses planted in your history$/.test(x))).toBe(true)
    expect(t).toContain('info: 2 domains expiring within 60 days')
    const soon = titles({ ...empty, expiring: fx.expiring, now: 1795171812 - 10 * 86400 })
    expect(soon).toContain('warn: 2 domains expiring within 60 days')
  })
  it('frozen, scam-flagged and unused accounts', () => {
    expect(titles({ ...empty, account: { address: '0:00', status: 'frozen', is_scam: true } })).toEqual(['danger: This wallet itself is flagged as a scam by tonapi', 'danger: The account is frozen'])
    expect(titles({ ...empty, account: accounts.nonexist as unknown as TonapiAccount })).toEqual(['info: Never used yet'])
  })
})
