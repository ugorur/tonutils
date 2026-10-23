import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import {
  buildContent, collectionContentCell, contentRows, decodeContent, detectCell, gatewayUrl, itemContentCell, joinItemUrl, keyHash,
  offchainContent, onchainContent, parseCollectionData, parseNftData, parseRoyaltyStack, readSnake, royaltyCell, royaltyFromPercent,
  royaltyPercent, setOnchainField, snakeCell, snakeText
} from './logic'

// All chain values below are real toncenter v3 answers (mainnet, 2026-10-22).

// TON Diamonds collection EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir
const GCD = [ // POST runGetMethod get_collection_data
  { type: 'num', value: '0x2710' },
  { type: 'cell', value: 'te6cckEBAQEAKQAATgFodHRwczovL25mdC50b24uZGlhbW9uZHMvZGlhbW9uZHMuanNvbvllC1Q=' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4Adh/Edny+qqqXcwLIF1Dy95Tl5zEslNjohYI+BJz2enbCcOvbE' }
]
const ROYALTY = [ // royalty_params
  { type: 'num', value: '0x16' },
  { type: 'num', value: '0x3e8' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4ARKckLuq22GdsiptP7thQNN+yRFCi1BGWZHcyFbaVcf5B/CukY' }
]
// Item #11 0:ecb48c17e9943dfb9ed603d74d06d4320cf5e273efc0290385c13a2ddfb0e5e8, get_nft_data
const ITEM = [
  { type: 'num', value: '-0x1' },
  { type: 'num', value: '0xb' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4AA2wI+hMswsjZlZYk+U+zZBCbRyVljvCzsVgnALopkjLBLbRXn' },
  { type: 'cell', value: 'te6cckEBAQEAJAAAQ4AdiJgdxTvWc6c2mf+KV8FoqtC2O2NHQMtkM33QZRsKKRADB97Z' },
  { type: 'cell', value: 'te6cckEBAQEADAAAFDExLzExLmpzb24BbkL+' }
]
// collection.get_nft_content(11, individual) -> full content
const FULL_11 = 'te6cckEBAgEALQABPAFodHRwczovL25mdC50b24uZGlhbW9uZHMvbmZ0LwEAFDExLzExLmpzb25lbe18'
// accountStates data_boc of the collection (getgems nft-collection-editable storage)
const DIAMONDS_DATA = 'te6ccgECEgEAAnMAA1OAHYfxHZ8vqqql3MCyBdQ8veU5ecxLJTY6IWCPgSc9np2gAAAAAAAE4hABAgMCAAQFART/APSkE/S88sgLBgBLABYD6IARKckLuq22GdsiptP7thQNN+yRFCi1BGWZHcyFbaVcf5AATgFodHRwczovL25mdC50b24uZGlhbW9uZHMvZGlhbW9uZHMuanNvbgA6aHR0cHM6Ly9uZnQudG9uLmRpYW1vbmRzL25mdC8CAWIHCAICzgkKAAmhH5/gBQIBIAsMAgEgEBEC1wyIccAkl8D4NDTAwFxsJJfA+D6QPpAMfoAMXHXIfoAMfoAMPACBLOOFDBsIjRSMscF8uGVAfpA1DAQI/AD4AbTH9M/ghBfzD0UUjC6jocyEDdeMkAT4DA0NDU1ghAvyyaiErrjAl8EhA/y8IA0OABE+kQwcLry4U2AB9lE1xwXy4ZH6QCHwAfpA0gAx+gCCCvrwgBuhIZRTFaCh3iLXCwHDACCSBqGRNuIgwv/y4ZIhjj6CEAUTjZHIUAnPFlALzxZxJEkUVEagcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAQR5QQKjdb4g8AcnCCEIt3FzUFyMv/UATPFhAkgEBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AACCAo41JvABghDVMnbbEDdEAG1xcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wCTMDI04lUC8AMAOztRNDTP/pAINdJwgCafwH6QNQwECQQI+AwcFltbYAAdAPIyz9YzxYBzxbMye1Ug'
// Jetton 0:00003AD9D5FB746D8F6A273B602BBF45B452599DCFDA2B437BB93C6D467659BB get_jetton_data content (on-chain TEP-64).
// toncenter /api/v3/jetton/masters decodes it to the jetton_content below.
const ONCHAIN = 'te6cckECEgEAAiMAAQMAwAECASACAwIBWAQFAgEgCAkBQb998XSzONLlGNMamblECBwkNZZVU22pRZFeBboXInMZzwYBQb9CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewcAwgBodHRwczovL2Nkbi5ibHVtLmNvZGVzLzQ5NGM5NWY2LWU2YjAtNDZmOS1hMDQxLTE1NmM3Yjk5NmEzZS85MzdhZjVjYS1kNWZiLTRkNzYtYWY4NC1iMGU2ODRkZDhjYTkAwgBodHRwczovL2Nkbi5ibHVtLmNvZGVzL2I1ODBhYWFjLTUwMWEtNGYxNC04MGQ4LTU0N2QyMGM4ZTE4Zi9lNjJiMDJmYi1mMTkyLTQ1NDktOTY1MS0xY2U5NWU0NWViOTUCASAKCwIBIA4PAUG/RUam/+G3nP3Ya609uHQxPc3i+wXmp0qn81UtlhfHnRMMAUG/btT5QqeEjOLLBmt3oRKMah/4xD9Dii3OJGErqf+riwMNABwAUFVQU0tJUFAgR0FORwAKAFBVUEcBQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCRABQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfREAlABXZSBtYWRlIHRoaXMgY29pbiBmb3Igb3VyIGZhdm9yaXRlIHN1YnNjcmliZXJzLCBldmVyeW9uZSB3aWxsIGhhdmUgYSBncm93AAQAORMXtJE='
const ONCHAIN_EXPECTED = {
  decimals: '9',
  description: 'We made this coin for our favorite subscribers, everyone will have a grow',
  image: 'https://cdn.blum.codes/b580aaac-501a-4f14-80d8-547d20c8e18f/e62b02fb-f192-4549-9651-1ce95e45eb95',
  name: 'PUPSKIPP GANG',
  symbol: 'PUPG'
}

describe('reading chain data', () => {
  it('collection content = toncenter collection_content.uri', () => {
    const c = parseCollectionData(GCD)
    expect(c.nextItemIndex).toBe(10000n)
    expect(decodeContent(c.content)).toEqual({ kind: 'offchain', uri: 'https://nft.ton.diamonds/diamonds.json' })
    expect(c.owner!.toRawString().toUpperCase()).toBe('0:EC3F88ECF97D55552EE605902EA1E5EF29CBCE625929B1D10B047C0939ECF4ED')
  })

  it('royalty params = 2.2%', () => {
    const r = parseRoyaltyStack(ROYALTY)
    expect(royaltyPercent(r)).toBeCloseTo(2.2)
    expect(r.destination).not.toBeNull()
  })

  it('item data and full URL = toncenter nft/items content.uri', () => {
    const it = parseNftData(ITEM)
    expect(it.init).toBe(true)
    expect(it.index).toBe(11n)
    expect(it.collection!.equals(Address.parse('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir'))).toBe(true)
    expect(snakeText(it.individual)).toBe('11/11.json')
    expect(decodeContent(Cell.fromBase64(FULL_11))).toEqual({ kind: 'offchain', uri: 'https://nft.ton.diamonds/nft/11/11.json' })
    expect(joinItemUrl('https://nft.ton.diamonds/nft/', '11/11.json')).toBe('https://nft.ton.diamonds/nft/11/11.json')
  })

  it('detects the parts of a real collection storage cell', () => {
    const data = Cell.fromBase64(DIAMONDS_DATA)
    const wrapper = detectCell(data.refs[0]!)
    expect(wrapper).toEqual({ kind: 'collection-wrapper', content: { kind: 'offchain', uri: 'https://nft.ton.diamonds/diamonds.json' }, common: 'https://nft.ton.diamonds/nft/' })
    const roy = detectCell(data.refs[2]!)
    expect(roy.kind).toBe('royalty')
    if (roy.kind === 'royalty') expect([roy.royalty.numerator, roy.royalty.denominator]).toEqual([22, 1000])
    // our builders reproduce both cells exactly
    expect(collectionContentCell(offchainContent('https://nft.ton.diamonds/diamonds.json'), 'https://nft.ton.diamonds/nft/').hash().equals(data.refs[0]!.hash())).toBe(true)
    if (roy.kind === 'royalty') expect(royaltyCell(roy.royalty).hash().equals(data.refs[2]!.hash())).toBe(true)
    // individual content of item #11 is exactly our item content cell
    expect(itemContentCell('11/11.json').hash().equals(Cell.fromBase64('te6cckEBAQEADAAAFDExLzExLmpzb24BbkL+').hash())).toBe(true)
  })

  it('decodes real on-chain (0x00 dictionary) content like toncenter does', () => {
    const d = decodeContent(Cell.fromBase64(ONCHAIN))
    expect(d.kind).toBe('onchain')
    if (d.kind !== 'onchain') return
    // Every field toncenter shows, plus cover_image (a key toncenter's decoder does not list).
    expect(Object.fromEntries(d.fields.map(f => [f.key, f.text]))).toMatchObject(ONCHAIN_EXPECTED)
    expect(d.fields.map(f => f.key).sort()).toEqual(['cover_image', 'decimals', 'description', 'image', 'name', 'symbol'])
    expect(contentRows(d).find(r => r.label === 'symbol')?.value).toBe('PUPG')
  })

  it('rebuilds that on-chain content from its fields with the same keys and values', () => {
    const d = decodeContent(onchainContent(ONCHAIN_EXPECTED))
    expect(d.kind === 'onchain' && Object.fromEntries(d.fields.map(f => [f.key, f.text]))).toEqual(ONCHAIN_EXPECTED)
  })

  it('renaming real on-chain content keeps every other field byte for byte', () => {
    const before = decodeContent(Cell.fromBase64(ONCHAIN))
    const after = decodeContent(setOnchainField(Cell.fromBase64(ONCHAIN), 'name', 'Renamed'))
    if (before.kind !== 'onchain' || after.kind !== 'onchain') throw new Error('expected on-chain content')
    const other = (d: typeof before & { kind: 'onchain' }) => d.fields.filter(f => f.key !== 'name').map(f => [f.keyHash, f.hex]).sort()
    expect(other(after)).toEqual(other(before))
    expect(after.fields.find(f => f.key === 'name')?.text).toBe('Renamed')
  })
})

describe('codecs', () => {
  it('sha256 key of "name" (TEP-64 example value)', () => {
    // TEP-64: name -> 0x82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89
    expect(keyHash('name').toString('hex')).toBe('82a3537ff0dbce7eec35d69edc3a189ee6f17d82f353a553f9aa96cb0be3ce89')
  })

  it('long URLs snake across cells and round-trip', () => {
    const url = 'https://example.com/' + 'a'.repeat(300) + '.json'
    const c = offchainContent(url)
    expect(c.refs).toHaveLength(1)
    expect(c.bits.length).toBe(127 * 8)
    expect(decodeContent(c)).toEqual({ kind: 'offchain', uri: url })
    expect(readSnake(snakeCell('héllo')).toString()).toBe('héllo')
  })

  it('royalty from percent', () => {
    const a = Address.parse('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir')
    expect(royaltyFromPercent('5', a)).toMatchObject({ numerator: 50, denominator: 1000 })
    expect(royaltyFromPercent('2.5', a)).toMatchObject({ numerator: 25 })
    expect(() => royaltyFromPercent('101', a)).toThrow()
    expect(() => royaltyFromPercent('1.25', a)).toThrow()
  })

  it('builder form', () => {
    expect(decodeContent(buildContent('offchain', ' ipfs://abc ', {}))).toEqual({ kind: 'offchain', uri: 'ipfs://abc' })
    expect(() => buildContent('onchain', '', { name: ' ' })).toThrow()
    expect(detectCell(itemContentCell('0.json'))).toEqual({ kind: 'text', text: '0.json' })
  })

  it('gateway links', () => {
    expect(gatewayUrl('ipfs://bafy/1.json')).toBe('https://gateway.pinata.cloud/ipfs/bafy/1.json')
    expect(gatewayUrl('https://x.y/a')).toBe('https://x.y/a')
  })
})
