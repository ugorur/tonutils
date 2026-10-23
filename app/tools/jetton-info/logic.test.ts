import { describe, expect, it } from 'vitest'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import { friendly, jettonBasics, sameAddress, toRaw, verificationInfo } from '~/lib/jettons-read/core'
import type { DexPair } from './logic'
import { chartColumns, isRenounced, marketCap, metadataSource, parseDiff, topPools, trustSignals } from './logic'

// tonapi GET /v2/jettons/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs (USD₮), 2026-10-22, trimmed.
const USDT: TonapiJetton = {
  mintable: true,
  total_supply: '1429976002510000',
  admin: { address: '0:6440fe3c69410383963945173c4b11479bf0b9b4d7090e58777bda581c2f9998', is_scam: false, is_wallet: true },
  metadata: { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', name: 'Tether USD', symbol: 'USD₮', decimals: '6', image: 'https://tether.to/images/logoCircle.png', description: 'Tether Token for Tether USD' },
  preview: 'https://cache.tonapi.io/imgproxy/T3PB4s7oprNVaJkwqbGg54nexKE0zzKhcrPv8jcWYzU/rs:fill:200:200:1/g:no/aHR0cHM6Ly90ZXRoZXIudG8vaW1hZ2VzL2xvZ29DaXJjbGUucG5n.webp',
  verification: 'whitelist',
  holders_count: 3441126
}

// toncenter GET /api/v3/jetton/masters?address=… jetton_content, 2026-10-22.
const CONTENT = {
  usdt: { decimals: '6', uri: 'https://tether.to/usdt-ton.json' },
  ston: { uri: 'https://static.ston.fi/jetton/ston.json' },
  hgram: { decimals: '9', description: 'Hipo liquid staked GRAM', image: 'https://hipo.finance/hgram.svg', name: 'Hipo Staked GRAM', symbol: 'hGRAM' }
}

// DexScreener GET /latest/dex/tokens/EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT, 2026-10-22, 4 of 18 pairs, trimmed.
const NOT_PAIRS: DexPair[] = [
  { chainId: 'ton', dexId: 'dedust', url: 'https://dexscreener.com/ton/eqcuhnollvxtldej3_9k0ymetq4wv6rfbtxr2wnzkzuczeer', pairAddress: 'EQCUhnOllvxtLDEj3_9k0yMeTQ4Wv6rFBtXr2wnzKzucZeER', priceUsd: '0.0003857', baseToken: { address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', symbol: 'NOT' }, quoteToken: { address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', symbol: 'GRAM' }, liquidity: { usd: 22362 }, volume: { h24: 1868.36 } },
  { chainId: 'ton', dexId: 'stonfi', url: 'https://dexscreener.com/ton/eqcay8ifl2s6lrbmbjey35liumxpc8jfitwg4tl7lbgrsor2', pairAddress: 'EQCaY8Ifl2S6lRBMBJeY35LIuMXPc8JfItWG4tl7lBGrSoR2', priceUsd: '0.0003893', baseToken: { address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', symbol: 'NOT' }, quoteToken: { address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', symbol: 'GRAM' }, liquidity: { usd: 158607.62 }, volume: { h24: 2678.5 } },
  { chainId: 'ton', dexId: 'stonfi', url: 'https://dexscreener.com/ton/eqark5mkz_mk51u5azjk3hxhlg1smqg2z-4pb7zapi_xwmrn', pairAddress: 'EQARK5MKz_MK51U5AZjK3hxhLg1SmQG2Z-4Pb7Zapi_xwmrN', priceUsd: '0.0003909', baseToken: { address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', symbol: 'NOT' }, quoteToken: { address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', symbol: 'USD₮' }, liquidity: { usd: 35787.39 }, volume: { h24: 803.22 } },
  { chainId: 'ton', dexId: 'stonfi', url: 'https://dexscreener.com/ton/eqd7pe0izumjtreyabf0vvswsj455asbztwpu3v-9_7ei_zh', pairAddress: 'EQD7Pe0IZumjTReYabF0vvswSj455aSbZTWpu3v-9_7Ei_zH', baseToken: { address: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', symbol: 'NOT' }, quoteToken: { address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', symbol: 'GRAM' }, liquidity: { usd: 0 }, volume: { h24: 0 } }
]

describe('shared address helpers', () => {
  it('converts between raw and friendly forms (USD₮ master)', () => {
    expect(toRaw('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')).toBe('0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe')
    expect(friendly('0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE')).toBe('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
    // toncenter address_book user_friendly for owner 0:00B2CC7A… is UQAAssx6…
    expect(friendly('0:00b2cc7a1de4af4f515949fd7106eccf6ad22081c514a8a3fc2e64649356d3f8', { bounceable: false })).toBe('UQAAssx6HeSvT1FZSf1xBuzPatIggcUUqKP8LmRkk1bT-JLR')
    expect(sameAddress('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE')).toBe(true)
    expect(sameAddress('nope', '0:00')).toBe(false)
  })

  it('reads name, symbol and decimals from tonapi', () => {
    expect(jettonBasics(USDT)).toMatchObject({ raw: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', symbol: 'USD₮', decimals: 6, verification: 'whitelist' })
    expect(verificationInfo('blacklist').label).toBe('Scam')
    expect(verificationInfo('something-new').label).toBe('Unverified')
  })
})

describe('metadataSource', () => {
  it('tells on-chain, off-chain and hybrid content apart', () => {
    expect(metadataSource(CONTENT.hgram)).toMatchObject({ kind: 'onchain', mutable: false })
    expect(metadataSource(CONTENT.ston)).toMatchObject({ kind: 'offchain', uri: 'https://static.ston.fi/jetton/ston.json', mutable: true })
    expect(metadataSource(CONTENT.usdt)).toMatchObject({ kind: 'hybrid', mutable: true })
    expect(metadataSource({ uri: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' }).mutable).toBe(false)
    expect(metadataSource(null).kind).toBe('onchain')
  })
})

describe('trustSignals', () => {
  it('USD₮: verified, admin can mint, governed', () => {
    const s = trustSignals({ verification: 'whitelist', admin: USDT.admin!.address, mintable: true, governed: true, source: metadataSource(CONTENT.usdt) })
    expect(s.map(x => x.title)).toEqual(['Verified token', 'Admin can mint more', 'Issuer can freeze wallets', 'Metadata hosted on a website'])
  })
  it('NOT: admin renounced (toncenter admin_address null)', () => {
    expect(isRenounced(null)).toBe(true)
    expect(isRenounced('0:0000000000000000000000000000000000000000000000000000000000000000')).toBe(true)
    const s = trustSignals({ verification: 'whitelist', admin: null, mintable: true, governed: false, source: metadataSource({ decimals: '9', uri: 'https://cdn.joincommunity.xyz/clicker/not.json' }) })
    expect(s.find(x => x.title === 'Admin renounced')?.level).toBe('good')
    expect(s.some(x => x.title.includes('mint'))).toBe(false)
  })
  it('governed wallet code with a renounced admin: nobody can freeze any more', () => {
    const s = trustSignals({ verification: 'whitelist', admin: null, mintable: true, governed: true, source: null })
    expect(s.some(x => x.title === 'Issuer can freeze wallets')).toBe(false)
  })
  it('unverified and scam tokens get a warning first', () => {
    expect(trustSignals({ verification: 'none', admin: null, mintable: false, governed: false, source: metadataSource(CONTENT.hgram) })[0]!.level).toBe('warn')
    expect(trustSignals({ verification: 'blacklist', admin: null, mintable: false, governed: false, source: metadataSource(CONTENT.hgram) })[0]!.level).toBe('bad')
  })
})

describe('market numbers', () => {
  it('parses tonapi diff strings with a Unicode minus', () => {
    // tonapi /v2/rates?tokens=USD₮ diff_24h.USD
    expect(parseDiff('−0.04%')).toBe(-0.04)
    expect(parseDiff('+1.5%')).toBe(1.5)
    expect(parseDiff(undefined)).toBeUndefined()
  })
  it('computes fully diluted value from supply and price', () => {
    // 1 429 976 002.51 USD₮ × 0.9989012086704624 (tonapi /rates) = 1428404757.277 (Python)
    expect(marketCap(BigInt(USDT.total_supply), 6, 0.9989012086704624)).toBeCloseTo(1428404757.277, 2)
  })
  it('sorts chart points ascending', () => {
    // tonapi /v2/rates/chart?token=NOT&currency=usd, first 3 points (newest first)
    const [x, y] = chartColumns([[1792698360, 0.0003856526186476411], [1792695600, 0.000386194760126563], [1792684800, 0.0003872356672938532]])
    expect(x).toEqual([1792684800, 1792695600, 1792698360])
    expect(y[2]).toBe(0.0003856526186476411)
  })
  it('lists pools with liquidity, deepest first', () => {
    const pools = topPools(NOT_PAIRS)
    expect(pools.map(p => p.address)).toEqual(['EQCaY8Ifl2S6lRBMBJeY35LIuMXPc8JfItWG4tl7lBGrSoR2', 'EQARK5MKz_MK51U5AZjK3hxhLg1SmQG2Z-4Pb7Zapi_xwmrN', 'EQCUhnOllvxtLDEj3_9k0yMeTQ4Wv6rFBtXr2wnzKzucZeER'])
    expect(pools[0]).toMatchObject({ dex: 'STON.fi', pair: 'NOT / GRAM', liquidity: 158607.62 })
    expect(pools[2]!.dex).toBe('DeDust')
    expect(topPools(null)).toEqual([])
  })
})
