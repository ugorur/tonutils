import { Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { FetchCheck } from '~/lib/jettons-dev/fetchCheck'
import { blockedUrlReason, imageSize, sniffType } from '~/lib/jettons-dev/fetchCheck'
import { USDT_CONTENT } from '~/lib/jettons-dev/fixtures'
import { mergeMetadata } from '~/tools/jetton-metadata-codec/logic'
import { checkImageFetch, checkJsonFetch, checkUri, compareWithTonapi, decodeContent, kindFromInterfaces, resolveUri, summarize, validateMetadata } from './logic'

// Real files fetched 2026-10-22: https://tether.to/usdt-ton.json, https://static.ston.fi/jetton/ston.json,
// tonapi GET /v2/jettons/EQCxE6mU… (USD₮). Image headers: stGRAM.png (bemo-fi/tokens), a Fragment number .webp,
// and Pillow's Tests/images/hopper.jpg (first 220 bytes, SOF0 at offset 199).
const USDT_JSON = { name: 'Tether USD', description: 'Tether Token for Tether USD', image: 'https://tether.to/images/logoCircle.png', symbol: 'USD₮' }
const STON_JSON = { name: 'STON', symbol: 'STON', description: 'STON is the utility token…', image: 'https://static.ston.fi/logo/ston_symbol.png', decimals: '9', social: ['https://t.me/stonfidex'], websites: ['https://ston.fi/'] }
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000070000000700806000000c6e0f4', 'hex')
const WEBP = Buffer.from('524946465813020057454250565038204c13020090e1039d012adc05dc050040', 'hex')
const JPEG = Buffer.from('ffd8ffe000104a46494600010101006000600000fffe002746696c65207772697474656e2062792041646f62652050686f746f73686f70a820342e3000ffdb0043000403030303020403030304040405060a06060505060c0809070a0e0c0f0e0e0c0d0d0f1116130f1015110d0d131a131517181919190f121b1d1b181d16181918ffdb0043010404040605060b06060b18100d101818181818181818181818181818181818181818181818181818181818181818181818181818181818181818181818181818ffc00011080080008003012200021101031101ffc4', 'hex')

const fc = (p: Partial<FetchCheck>): FetchCheck => ({
  url: 'https://x.org/a', finalUrl: 'https://x.org/a', redirects: [], status: 200, ok: true, contentType: 'application/json',
  size: 151, truncated: false, cors: null, ms: 300, sniff: 'json', image: null, text: null, ...p
})
const levels = (cs: { level: string }[]) => cs.map(c => c.level)

describe('validateMetadata with real metadata', () => {
  it('USD₮: on-chain decimals merged over tether.to JSON passes with no errors', () => {
    const merged = mergeMetadata(decodeContent(Cell.fromBase64(USDT_CONTENT)).json, USDT_JSON)
    const checks = validateMetadata('jetton', merged)
    expect(checks.filter(c => c.level === 'error')).toEqual([])
    expect(checks.some(c => c.title === 'decimals is 6')).toBe(true)
  })

  it('STON JSON alone passes (decimals as string)', () => {
    expect(validateMetadata('jetton', STON_JSON).filter(c => c.level === 'error')).toEqual([])
  })

  it('USD₮ JSON without the on-chain part warns that decimals default to 9', () => {
    expect(validateMetadata('jetton', USDT_JSON).find(c => c.title.startsWith('decimals'))!.level).toBe('warn')
  })

  it('flags the usual mistakes', () => {
    const t = (m: Record<string, unknown>) => validateMetadata('jetton', m).filter(c => c.level !== 'ok').map(c => c.title)
    expect(t({ name: 'A', symbol: 'A', decimals: 9, image: 'https://a.org/i.png', description: 'd' })).toEqual(['decimals is a number, TEP-64 says string'])
    expect(t({ name: 'A', symbol: 'A', decimals: '300', image: 'ftp://a', description: 'd' })).toEqual(['decimals is not a whole number from 0 to 255', 'image is not an https or ipfs link'])
    expect(t({ symbol: 5 })).toContain('symbol must be a string')
    expect(t({ name: 'A', symbol: 'A', decimals: '9', description: 'd' })).toEqual(['No image or image_data'])
  })

  it('NFT attributes shape', () => {
    const good = validateMetadata('nft-item', { name: 'Diamond #1', image: 'https://x/i.png', description: 'd', attributes: [{ trait_type: 'Size', value: 'Small' }] })
    expect(levels(good)).not.toContain('warn')
    expect(validateMetadata('nft-item', { name: 'x', image: 'https://x', attributes: { a: 1 } }).some(c => c.title.startsWith('attributes are not'))).toBe(true)
  })
})

describe('URL checks', () => {
  it('URI schemes and ipfs gateway', () => {
    expect(levels(checkUri('https://tether.to/usdt-ton.json'))).toEqual(['ok'])
    expect(levels(checkUri('http://a.org/x.json'))).toEqual(['warn'])
    expect(levels(checkUri('ftp://a.org/x.json'))).toEqual(['error'])
    expect(resolveUri('ipfs://bafyabc/meta.json')).toBe('https://gateway.pinata.cloud/ipfs/bafyabc/meta.json')
    expect(resolveUri('ipfs://ipfs/Qm1/x')).toBe('https://gateway.pinata.cloud/ipfs/Qm1/x')
  })

  it('JSON fetch: real tether.to answer is valid; HTML and 404 are errors', () => {
    const ok = checkJsonFetch(fc({ text: JSON.stringify(USDT_JSON) }))
    expect(ok.json).toEqual(USDT_JSON)
    expect(levels(ok.checks)).toEqual(['ok', 'ok', 'info']) // tether.to sends no CORS header
    expect(checkJsonFetch(fc({ sniff: 'html', contentType: 'text/html' })).checks.at(-1)!.title).toMatch(/web page/)
    expect(checkJsonFetch(fc({ ok: false, status: 404 })).checks.at(-1)!.level).toBe('error')
    expect(checkJsonFetch(fc({ error: 'No answer within 10 seconds' })).json).toBeNull()
    expect(checkJsonFetch(fc({ sniff: null, contentType: 'text/plain' })).checks.at(-1)!.title).toBe('Not valid JSON')
    expect(checkJsonFetch(fc({ truncated: true, size: 2 * 1024 * 1024 })).checks.at(-1)!.title).toBe('The file is too big')
  })

  it('image fetch: real stGRAM.png (112×112) is fine but small; text/html is an error', () => {
    const png = checkImageFetch(fc({ contentType: 'image/png', sniff: sniffType(PNG), image: imageSize(PNG), size: 3179 }), 'jetton')
    expect(png.map(c => c.title)).toEqual(['Image loads (HTTP 200, 3.1 KB, 300 ms)', 'Image format: PNG', '112 × 112 px', 'Small image'])
    expect(checkImageFetch(fc({ contentType: 'text/html', sniff: 'html' }), 'jetton').at(-1)!.level).toBe('error')
  })

  it('sniffType / imageSize on real file headers', () => {
    expect([sniffType(PNG), sniffType(WEBP), sniffType(JPEG)]).toEqual(['png', 'webp', 'jpeg'])
    expect(imageSize(PNG)).toEqual({ width: 112, height: 112 })
    expect(imageSize(WEBP)).toEqual({ width: 1500, height: 1500 })
    expect(imageSize(JPEG)).toEqual({ width: 128, height: 128 })
    expect(sniffType(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
    expect(sniffType(new TextEncoder().encode('<!DOCTYPE html><html>'))).toBe('html')
  })

  it('blockedUrlReason keeps the checker off private networks', () => {
    const r = (u: string) => blockedUrlReason(new URL(u))
    expect(r('https://tether.to/usdt-ton.json')).toBeNull()
    expect(r('http://localhost/x')).toMatch(/Local/)
    expect(r('http://127.0.0.1/x')).toMatch(/Private/)
    expect(r('http://192.168.1.1/x')).toMatch(/Private/)
    expect(r('http://[::1]/x')).toMatch(/IPv6/)
    expect(r('https://a.org:22/x')).toMatch(/ports/)
    expect(r('file:///etc/passwd')).toMatch(/http/)
    expect(r('https://user:pw@a.org/')).toMatch(/credentials/)
    // WHATWG URL normalizes numeric hosts, so decimal / hex forms of 127.0.0.1 are caught too
    expect(r('http://2130706433/x')).toMatch(/Private/)
    expect(r('http://0x7f.1/x')).toMatch(/Private/)
    expect(r('http://169.254.169.254/latest')).toMatch(/Private/)
  })
})

describe('compareWithTonapi', () => {
  it('USD₮: tonapi shows the same name, symbol, decimals and image; whitelist', () => {
    const merged = mergeMetadata({ decimals: '6', uri: 'https://tether.to/usdt-ton.json' }, USDT_JSON)
    const tonapi = { name: 'Tether USD', symbol: 'USD₮', decimals: '6', image: 'https://tether.to/images/logoCircle.png', verification: 'whitelist' }
    const cs = compareWithTonapi(merged, tonapi, 'jetton')
    expect(levels(cs)).toEqual(['ok', 'ok', 'ok', 'ok', 'info'])
    expect(compareWithTonapi({ ...merged, symbol: 'USDT' }, tonapi, 'jetton')[1]!.title).toBe('tonapi shows a different symbol')
  })
})

describe('kindFromInterfaces / summarize', () => {
  it('maps tonapi interfaces', () => {
    expect(kindFromInterfaces(['jetton_master'])).toBe('jetton')
    expect(kindFromInterfaces(['nft_item', 'nft_royalty'])).toBe('nft-item')
    expect(kindFromInterfaces(['nft_collection'])).toBe('nft-collection')
    expect(kindFromInterfaces(['wallet_v4r2'])).toBeNull()
    expect(summarize([{ title: 'a', checks: [{ level: 'error', title: 'x' }, { level: 'warn', title: 'y' }, { level: 'ok', title: 'z' }] }])).toEqual({ errors: 1, warnings: 1 })
  })
})
