import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import fixture from './fixture.json'
import { buildRows, classifyScanInput, deriveAll, hasActivity, scanAddresses } from './logic'

// A key with four live versions. On-chain facts (toncenter walletStates / tonapi pubkeys wallets, 2026-10-22):
// v5r1 0:EF82…CE29, v4r2 0:A1A8…03E7, v3r2 0:E84C…AC09, v3r1 0:5098…2083, all active.
const KEY = '385f24f09ebc50e71c5031b574d4ddb88ee7d4699f973f6b064a4086807d4624'

describe('classifyScanInput', () => {
  it('reads keys and addresses', () => {
    expect(classifyScanInput(KEY.toUpperCase())).toEqual({ kind: 'publicKey', publicKey: KEY })
    expect(classifyScanInput(Buffer.from(KEY, 'hex').toString('base64')).kind).toBe('publicKey')
    expect(classifyScanInput('UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI').kind).toBe('address')
    expect(() => classifyScanInput('1234')).toThrow()
  })
})

describe('deriveAll', () => {
  it('derives the addresses the indexers report for this key', () => {
    const d = Object.fromEntries(deriveAll(KEY, 'mainnet').map(w => [w.version, w.raw.toUpperCase()]))
    expect(d.v5r1).toBe('0:EF822955E0FCBA908AE76D711E12DC314CC4318EDE66B74C3D62821B6B29CE29')
    expect(d.v4r2).toBe('0:A1A8C04F935389F353AC57E27CA701210772D5D0D690EA1699C0CB5F119B03E7')
    expect(d.v3r2).toBe('0:E84CB0793C955AF0A2CF7DA91ED31880B3C315B8B97D0341246D6A5A9B2EAC09')
    expect(d.v3r1).toBe('0:5098AA2180BCECA7B10648C0EA8DFE35A14AE0F4449918017445C80BAA842083')
  })
})

describe('buildRows', () => {
  const derived = deriveAll(KEY, 'mainnet')
  const input = Address.parse('0:EF822955E0FCBA908AE76D711E12DC314CC4318EDE66B74C3D62821B6B29CE29')
  const rows = buildRows({ derived, states: fixture.states, jettons: fixture.jettons, nfts: fixture.nfts, indexed: fixture.tonapi, input, testOnly: false })
  const by = Object.fromEntries(rows.map(r => [r.version, r]))

  it('merges balances, jettons and NFTs per version', () => {
    expect(rows.filter(hasActivity).map(r => r.version).sort()).toEqual(['v3r1', 'v3r2', 'v4r2', 'v5r1'])
    expect(by.v4r2!.balance).toBe(43616191856981n)
    expect(by.v5r1!.isInput).toBe(true)
    // toncenter counts agree with tonapi stats (independent indexer): jettons 26/13/9/1, NFTs 158/40/114/0
    expect([by.v4r2!.jettonCount, by.v3r2!.jettonCount, by.v3r1!.jettonCount, by.v5r1!.jettonCount]).toEqual([26, 13, 9, 1])
    expect([by.v4r2!.nfts, by.v3r2!.nfts, by.v3r1!.nfts, by.v5r1!.nfts]).toEqual([158, 40, 114, 0])
    expect(by.v1r1!.status).toBe('nonexist')
  })
  it('reads jetton symbols and decimals from toncenter metadata', () => {
    const not = by.v4r2!.jettons.find(j => j.symbol === '$NOT')
    expect(not?.decimals).toBe(14)
  })
  it('tonapi-only wallets become extra rows', () => {
    const extra = buildRows({
      derived: derived.slice(0, 1),
      states: { wallets: [] },
      jettons: { jetton_wallets: [] },
      nfts: { nft_items: [] },
      indexed: fixture.tonapi,
      testOnly: false
    })
    expect(extra.filter(r => r.source === 'indexed').map(r => r.version).sort()).toEqual(['wallet_v3r1', 'wallet_v3r2', 'wallet_v4r2'])
    expect(extra.find(r => r.version === 'wallet_v3r1')?.nfts).toBe(114)
    expect(scanAddresses(derived.slice(0, 1), fixture.tonapi)).toHaveLength(4)
  })
})
