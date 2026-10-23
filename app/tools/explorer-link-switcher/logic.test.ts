import { describe, expect, it } from 'vitest'
import { parseExplorerInput, parseHash, switchLinks } from './logic'

// Real mainnet data read 2026-10-22:
// - tolya.ton wallet deploy tx (toncenter /api/v3/transactions): hash base64 below, lt 25178353000001.
//   Its hex form opens on tonviewer.com/transaction/, tonscan.org/tx/ and tonscan.com/transactions/ (HTTP 200).
// - Address forms from toncenter /api/v2/detectAddress.
const TX = {
  base64: 'Q0l+GVAoqUGKHiAAy1ptc1ONDy6EBiEPrwZ5ovNkLbA=',
  base64url: 'Q0l-GVAoqUGKHiAAy1ptc1ONDy6EBiEPrwZ5ovNkLbA',
  hex: '43497e195028a9418a1e2000cb5a6d73538d0f2e8406210faf0679a2f3642db0',
  lt: '25178353000001'
}
const TOLYA = {
  raw: '0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc',
  b: 'EQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3Fy9',
  n: 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4'
}
const USDT = { b: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', raw: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe' }
const DNS_COLLECTION = { b: 'EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz', raw: '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf' }
const FOUNDATION_TON_NFT = { b: 'EQB43-VCmf17O7YMd51fAvOjcMkCw46N_3JMCoegH_ZDo40e', raw: '0:78dfe54299fd7b3bb60c779d5f02f3a370c902c38e8dff724c0a87a01ff643a3' }

describe('parseHash', () => {
  it.each([TX.hex, TX.hex.toUpperCase(), TX.base64, TX.base64url, TX.base64.replace('+', ' ')])('reads %s', (h) => {
    expect(Buffer.from(parseHash(h)!).toString('hex')).toBe(TX.hex)
  })
  it('rejects other lengths', () => {
    expect(parseHash(TX.hex.slice(2))).toBeNull()
    expect(parseHash('hello')).toBeNull()
  })
})

describe('parseExplorerInput: transactions', () => {
  it.each([
    [`https://tonviewer.com/transaction/${TX.hex}`, 'Tonviewer'],
    [`https://tonscan.org/tx/${TX.hex}`, 'Tonscan'],
    [`https://tonscan.org/tx/${TX.base64url}`, 'Tonscan'],
    [`https://tonscan.com/transactions/${TX.hex}`, 'tonscan.com'],
    [`https://dton.io/tx/${TX.hex}`, 'dton.io'],
    [`https://tonwhales.com/explorer/address/${TOLYA.b}/${TX.lt}_${TX.hex}`, 'Tonwhales'],
    [`https://explorer.toncoin.org/transaction?account=${TOLYA.b}&lt=${TX.lt}&hash=${TX.hex}`, 'explorer.toncoin.org'],
    [`https://explorer.toncoin.org/transaction?account=${TOLYA.b}&lt=${TX.lt}&hash=${encodeURIComponent(TX.base64)}`, 'explorer.toncoin.org'],
    [`tonviewer.com/transaction/${TX.hex}`, 'Tonviewer'],
    [TX.base64, 'plain']
  ])('%s', (url, source) => {
    const r = parseExplorerInput(url)
    expect(r).toMatchObject({ kind: 'tx', source, network: source === 'plain' ? null : 'mainnet', tx: { hex: TX.hex, base64: TX.base64, base64url: TX.base64url } })
  })

  it('detects testnet hosts', () => {
    expect(parseExplorerInput(`https://testnet.tonviewer.com/transaction/${TX.hex}`).network).toBe('testnet')
    expect(parseExplorerInput(`https://testnet.tonscan.org/tx/${TX.hex}`).network).toBe('testnet')
    expect(parseExplorerInput(`https://test-explorer.toncoin.org/transaction?hash=${TX.hex}`).network).toBe('testnet')
  })

  it('builds tx links on the other explorers', () => {
    const urls = switchLinks(parseExplorerInput(`https://tonscan.org/tx/${TX.base64url}`), 'mainnet', true).map(l => l.url)
    expect(urls).toEqual([
      `https://tonviewer.com/transaction/${TX.hex}`,
      `https://tonscan.org/tx/${TX.hex}`,
      `https://tonscan.com/transactions/${TX.hex}`
    ])
  })
})

describe('parseExplorerInput: addresses', () => {
  it.each([
    [`https://tonviewer.com/${TOLYA.n}`, 'Tonviewer'],
    [`https://tonviewer.com/${TOLYA.n}?section=transactions`, 'Tonviewer'],
    [`https://tonscan.org/address/${TOLYA.b}`, 'Tonscan'],
    [`https://tonscan.com/${TOLYA.n}`, 'tonscan.com'],
    [`https://dton.io/a/${TOLYA.n}`, 'dton.io'],
    [`https://tonwhales.com/explorer/address/${TOLYA.b}`, 'Tonwhales'],
    [`https://explorer.toncoin.org/account?account=${TOLYA.b}`, 'explorer.toncoin.org'],
    [`https://www.tonviewer.com/${encodeURIComponent(TOLYA.raw)}`, 'Tonviewer'],
    [TOLYA.raw, 'plain']
  ])('%s', (url, source) => {
    expect(parseExplorerInput(url)).toMatchObject({ kind: 'address', source, address: { raw: TOLYA.raw, bounceable: TOLYA.b, nonBounceable: TOLYA.n } })
  })

  it('reads jetton, NFT and collection pages', () => {
    expect(parseExplorerInput(`https://tonscan.org/jetton/${USDT.b}`)).toMatchObject({ kind: 'jetton', address: { raw: USDT.raw } })
    // Tonviewer jetton balance page: /<owner>/jetton/<master>, the master is the jetton.
    expect(parseExplorerInput(`https://tonviewer.com/${TOLYA.n}/jetton/${USDT.b}`)).toMatchObject({ kind: 'jetton', address: { raw: USDT.raw } })
    expect(parseExplorerInput(`https://tonscan.org/nft/${FOUNDATION_TON_NFT.b}`)).toMatchObject({ kind: 'nft', address: { raw: FOUNDATION_TON_NFT.raw } })
    expect(parseExplorerInput(`https://getgems.io/collection/${DNS_COLLECTION.b}`)).toMatchObject({ kind: 'collection', source: 'Getgems', address: { raw: DNS_COLLECTION.raw } })
    // Getgems item page: /collection/<collection>/<item>.
    expect(parseExplorerInput(`https://getgems.io/collection/${DNS_COLLECTION.b}/${FOUNDATION_TON_NFT.b}`)).toMatchObject({ kind: 'nft', address: { raw: FOUNDATION_TON_NFT.raw } })
  })

  it('takes the network from a testnet address form when the host does not say', () => {
    expect(parseExplorerInput('kQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqKYH').network).toBe('testnet')
    expect(parseExplorerInput(TOLYA.n).network).toBeNull()
    expect(parseExplorerInput(`https://tonviewer.com/${TOLYA.n}`).network).toBe('mainnet')
    expect(parseExplorerInput(`https://example.org/${TOLYA.n}`)).toMatchObject({ source: 'example.org', network: null })
  })

  it('builds address links, keeping the requested bounce flag and network', () => {
    const r = parseExplorerInput(`https://tonscan.org/address/${TOLYA.b}`)
    expect(switchLinks(r, 'mainnet', false).map(l => l.url)).toEqual([
      `https://tonviewer.com/${TOLYA.n}`,
      `https://tonscan.org/address/${TOLYA.n}`,
      `https://tonscan.com/${TOLYA.n}`,
      `https://getgems.io/user/${TOLYA.n}`
    ])
    // Testnet forms of the TON Foundation wallet, verified with toncenter detectAddress.
    const test = switchLinks(parseExplorerInput('https://tonviewer.com/EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'), 'testnet', true)
    expect(test.map(l => l.id)).toEqual(['tonviewer', 'tonscan', 'getgems'])
    expect(test[0]!.url).toBe('https://testnet.tonviewer.com/kQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqKYH')
  })
})

describe('parseExplorerInput: errors', () => {
  it.each([
    ['', /Paste/],
    ['hello', /Not a link/],
    ['https://tonviewer.com/foundation.ton', /name foundation\.ton/],
    ['https://example.com/nothing/here', /No TON address/],
    [`https://tonviewer.com/5:${TOLYA.raw.slice(2)}`, /No TON address/]
  ])('%j', (input, msg) => {
    expect(() => parseExplorerInput(input)).toThrow(msg)
  })
})
