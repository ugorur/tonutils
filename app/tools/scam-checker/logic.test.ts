import { describe, expect, it } from 'vitest'
import accounts from '~/lib/security/fixtures/accounts.json'
import poisoner from '~/lib/security/fixtures/events-poisoner.json'
import ta from '~/lib/security/fixtures/tonapi.json'
import { rawOf, senderProfile } from '~/lib/security/core'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import type { TaEvent } from '~/lib/tx-user/events'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { kindOf, type ScamInput, scamChecks, type TonapiCollection, verdictOf } from './logic'

// Real tonapi responses (see each fixture's _source).
const acc = (k: keyof typeof accounts) => accounts[k] as unknown as TonapiAccount
const titles = (i: ScamInput) => scamChecks(i).map(c => `${c.level}: ${c.title}`)

describe('scamChecks on real accounts', () => {
  it('fake "GRAM AIRDROP" token: scam list, link in its name, still mintable', () => {
    const i = { account: acc('scam_jetton'), jetton: ta.jetton_scam as unknown as TonapiJetton }
    expect(kindOf(i.account)).toBe('jetton')
    const t = titles(i)
    expect(t).toContain('danger: This account is flagged as a scam by tonapi (Tonkeeper)')
    expect(t).toContain('danger: Token GRAM AT GRAMEVENT.ORG is on the tonapi / Tonkeeper scam list')
    expect(t).toContain('danger: The token\'s name or description contains a website or Telegram link')
    expect(t).toContain('warn: The creator can still mint more')
    expect(verdictOf(scamChecks(i))).toBe('scam')
  })

  it('Tether USD: verified, known, clean', () => {
    const i = { account: acc('usdt_master'), jetton: ta.jetton_usdt as unknown as TonapiJetton }
    const t = titles(i)
    expect(t).toContain('ok: Known as “Tether USD”')
    expect(t).toContain('ok: Token USD₮ is verified by tonapi / Tonkeeper')
    expect(verdictOf(scamChecks(i))).toBe('clean')
  })

  it('jetton wallet of the fake token reports its master\'s problems', () => {
    // tonapi get_wallet_data decoded.jetton for this jetton wallet is the fake GRAM master
    expect(rawOf(ta.wallet_data.decoded.jetton)).toBe(accounts.scam_jetton.address)
    const i = { account: acc('jetton_wallet'), jetton: ta.jetton_scam as unknown as TonapiJetton }
    expect(kindOf(i.account)).toBe('jetton-wallet')
    expect(titles(i)).toContain('danger: Its token GRAM AT GRAMEVENT.ORG is on the tonapi / Tonkeeper scam list')
  })

  it('"1,000,000 $DOGS voucher" NFT and a blacklisted collection', () => {
    const nft = { account: acc('scam_nft'), nft: ta.nft_scam as unknown as TonapiNft }
    expect(kindOf(nft.account)).toBe('nft')
    expect(titles(nft)).toContain('danger: This NFT is on the tonapi / Tonkeeper scam list')
    const col = { account: acc('scam_collection'), collection: ta.collection_scam as unknown as TonapiCollection }
    const t = titles(col)
    expect(t).toContain('danger: This collection is on the tonapi / Tonkeeper scam list')
    expect(t).toContain('info: Collection metadata is unreachable')
  })

  it('poisoning sender wallet', () => {
    const profile = senderProfile(poisoner.events as unknown as TaEvent[], accounts.poisoner.address)
    const t = titles({ account: acc('poisoner'), profile })
    expect(t).toContain('danger: Sends spam or address-poisoning transfers')
    expect(t).not.toContain('info: A regular wallet')
  })

  it('unknown contract gets the drainer warning, a known one does not', () => {
    const anon = { ...acc('stonfi_router'), name: undefined }
    expect(titles({ account: anon })[0]).toMatch(/^warn: Unknown smart contract/)
    expect(verdictOf(scamChecks({ account: acc('stonfi_router') }))).toBe('clean')
  })
})
