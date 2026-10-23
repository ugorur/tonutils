import { encodeTelegramUrlParameters } from '@tonconnect/ui'
import { describe, expect, it } from 'vitest'
import type { FetchCheck } from '~/lib/jettons-dev/fetchCheck'
import { analyzeManifest, decodeTelegramParams, expandEmbedded, lookalike, parseConnectLink, registrable, verdict } from './logic'

// Same ConnectRequest in four link forms (ton-connect spec deeplinks.md shapes), from the connect-link test vectors
// of ahmedsignate2/kalyx-wallet src/domain/tonconnect/connect-link-vectors.json.
const ID = 'ce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d59'
const TRACE = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const R = '%7B%22manifestUrl%22%3A%22https%3A%2F%2Fapp.ston.fi%2Ftonconnect-manifest.json%22%2C%22items%22%3A%5B%7B%22name%22%3A%22ton_addr%22%7D%2C%7B%22name%22%3A%22ton_proof%22%2C%22payload%22%3A%22a1b2c3-nonce_with.dots-and%3Deq%22%7D%5D%7D'
const LINKS = {
  tonkeeper: `https://app.tonkeeper.com/ton-connect?v=2&id=${ID}&trace_id=${TRACE}&r=${R}`,
  mytonwallet: `https://connect.mytonwallet.org/?v=2&id=${ID}&trace_id=${TRACE}&r=${R}`,
  tc: `tc://?v=2&id=${ID}&trace_id=${TRACE}&r=${R}`,
  telegram: 'https://t.me/wallet/start?startapp=tonconnect-v__2-id__ce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d59-trace--5Fid__0199a1b2--2Dc3d4--2D7e5f--2D8a9b--2D0c1d2e3f4a5b-r__--7B--22manifestUrl--22--3A--22https--3A--2F--2Fapp--2Eston--2Efi--2Ftonconnect--2Dmanifest--2Ejson--22--2C--22items--22--3A--5B--7B--22name--22--3A--22ton--5Faddr--22--7D--2C--7B--22name--22--3A--22ton--5Fproof--22--2C--22payload--22--3A--22a1b2c3--2Dnonce--5Fwith--2Edots--2Dand--3Deq--22--7D--5D--7D'
}
const REQUEST = { manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'a1b2c3-nonce_with.dots-and=eq' }] }

describe('parseConnectLink', () => {
  it('decodes every link form to the same request', () => {
    for (const [name, link] of Object.entries(LINKS)) {
      const d = parseConnectLink(link)
      expect(d.request, name).toEqual(REQUEST)
      expect(d.clientId, name).toBe(ID)
      expect(d.traceId, name).toBe(TRACE)
      expect(d.version, name).toBe('2')
      expect(d.embedded).toBeUndefined()
    }
    expect(parseConnectLink(LINKS.telegram)).toMatchObject({ form: 'telegram', opensIn: 't.me/wallet' })
    expect(parseConnectLink(LINKS.tonkeeper)).toMatchObject({ form: 'universal', opensIn: 'app.tonkeeper.com/ton-connect' })
    expect(parseConnectLink(LINKS.tc).form).toBe('tc')
    expect(parseConnectLink(`tonkeeper-tc://?v=2&id=${ID}&r=${R}&ret=none`)).toMatchObject({ form: 'custom-scheme', opensIn: 'tonkeeper-tc://', ret: 'none' })
    expect(parseConnectLink(JSON.stringify(REQUEST)).request).toEqual(REQUEST)
  })

  it('inverts the official SDK Telegram encoder', () => {
    const qs = `v=2&id=${ID}&trace_id=${TRACE}&r=${R}&ret=back`
    expect(decodeTelegramParams(encodeTelegramUrlParameters(qs))).toBe(qs)
  })

  it('reports what a clean link asks for', () => {
    const f = parseConnectLink(LINKS.tc).findings
    expect(f.map(x => x.title)).toEqual(['Shares your wallet address', 'Asks for a login proof (ton_proof)'])
    expect(verdict(f)).toBe('ok')
  })

  it('flags embedded transactions, look-alike hosts and foreign return URLs', () => {
    // EmbeddedWireRequest per deeplinks.md: sendTransaction of 0.005 to the address the TonConnect demo dApp uses.
    const wire = { m: 'st', vu: 1893456000, ms: [{ a: 'EQCKWpx7cNMpvmcN5ObM5lLUZHZRFKqYA4xmw9jOry0ZsF9M', am: '5000000' }] }
    const e = Buffer.from(JSON.stringify(wire)).toString('base64url')
    const r = encodeURIComponent(JSON.stringify({ manifestUrl: 'https://ston-fi.claim-airdrop.app/tonconnect-manifest.json', items: [{ name: 'ton_addr' }] }))
    const d = parseConnectLink(`tc://?v=2&id=${ID}&r=${r}&ret=${encodeURIComponent('https://evil.example/thanks')}&e=${e}`)
    expect(d.embedded).toEqual({ method: 'sendTransaction', validUntil: 1893456000, messages: [{ address: wire.ms[0]!.a, amount: '5000000' }] })
    const titles = d.findings.map(x => x.title)
    expect(titles).toContain('Also asks you to SEND a transaction')
    expect(titles).toContain('Look-alike domain')
    expect(titles).toContain('Sends you somewhere else after approval')
    expect(verdict(d.findings)).toBe('danger')
  })

  it('expands embedded signData and structured items', () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    expect(expandEmbedded(enc({ m: 'sd', n: '-239', t: 'text', tx: 'Confirm login' }))).toEqual({ method: 'signData', network: '-239', signData: { type: 'text', text: 'Confirm login' } })
    const jt = expandEmbedded(enc({ m: 'sm', i: [{ t: 'jetton', ma: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', d: 'UQ…', am: '1000000' }] }))
    expect(jt.method).toBe('signMessage')
    expect(jt.items![0]!.type).toBe('jetton')
    expect(jt.items![0]!.fields[0]).toEqual({ label: 'Jetton master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' })
  })

  it('treats a return URL on a look-alike suffix as foreign', () => {
    const r = encodeURIComponent(JSON.stringify({ manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }] }))
    const title = (ret: string) => parseConnectLink(`tc://?v=2&id=${ID}&r=${r}&ret=${encodeURIComponent(ret)}`).findings.find(f => /after approval/.test(f.title))!.title
    expect(title('https://app.ston.fi/swap')).toBe('Returns to the app after approval')
    expect(title('https://evilston.fi/claim')).toBe('Sends you somewhere else after approval')
    expect(title('tg://resolve?domain=x')).toBe('Sends you somewhere else after approval')
  })

  it('previews plain coin items as messages', () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const d = expandEmbedded(enc({ m: 'st', i: [{ t: 'ton', a: 'EQCKWpx7cNMpvmcN5ObM5lLUZHZRFKqYA4xmw9jOry0ZsF9M', am: '5000000' }] }))
    expect(d.messages).toEqual([{ address: 'EQCKWpx7cNMpvmcN5ObM5lLUZHZRFKqYA4xmw9jOry0ZsF9M', amount: '5000000' }])
    expect(d.items).toBeUndefined()
  })

  it('explains bad input', () => {
    expect(() => parseConnectLink('')).toThrow(/Paste/)
    expect(() => parseConnectLink('hello')).toThrow(/not a link/)
    expect(() => parseConnectLink('https://app.tonkeeper.com/transfer/UQ')).toThrow(/r= parameter/)
    expect(() => parseConnectLink('https://t.me/wallet?startapp=abc')).toThrow(/Telegram/)
    expect(() => parseConnectLink('tc://?v=2&r=%7Bbad')).toThrow(/not valid JSON/)
  })
})

describe('phishing heuristics', () => {
  it('spots brand names on foreign domains', () => {
    expect(lookalike('app.ston.fi')).toBeNull()
    expect(lookalike('ston-fi.claim.app')).toMatch(/STON\.fi/)
    expect(lookalike('tonkeeper-airdrop.com')).toMatch(/Tonkeeper/)
    expect(lookalike('example.com', 'Getgems Mint')).toMatch(/Getgems/)
    expect(lookalike('boston.com')).toBeNull()
    expect(lookalike('ston-fi.vercel.app')).toMatch(/STON\.fi/)
  })

  it('splits shared hosting suffixes per customer', () => {
    expect(registrable('ton-connect.github.io')).toBe('ton-connect.github.io')
    expect(registrable('a.b.example.com')).toBe('example.com')
    expect(registrable('shop.example.co.uk')).toBe('example.co.uk')
  })

  const check = (text: string | null, extra: Partial<FetchCheck> = {}): FetchCheck => ({
    url: 'https://app.ston.fi/tonconnect-manifest.json', finalUrl: 'https://app.ston.fi/tonconnect-manifest.json', redirects: [], status: 200, ok: true,
    contentType: 'application/json', size: text?.length ?? 0, truncated: false, cors: null, ms: 100, sniff: 'json', image: null, text, ...extra
  })
  // Fetched from https://app.ston.fi/tonconnect-manifest.json on 2026-10-23.
  const STON = '{"url":"https://app.ston.fi","name":"STON.fi","iconUrl":"https://static.ston.fi/logo/external-logo.jpg","termsOfUseUrl":"https://ston.fi/terms","privacyPolicyUrl":"https://ston.fi/privacy"}'

  it('accepts the real STON.fi manifest', () => {
    const r = analyzeManifest('https://app.ston.fi/tonconnect-manifest.json', check(STON))
    expect(r.manifest?.name).toBe('STON.fi')
    expect(r.appHost).toBe('app.ston.fi')
    expect(r.findings.filter(f => f.severity === 'danger' || f.severity === 'warn')).toEqual([])
  })

  it('flags dead, copied and look-alike manifests', () => {
    expect(analyzeManifest('https://x.io/m.json', check(null, { ok: false, status: 404 })).findings[0]!.title).toBe('Manifest cannot be loaded')
    const copied = analyzeManifest('https://ston-claim.xyz/m.json', check(STON, { finalUrl: 'https://ston-claim.xyz/m.json' }))
    expect(copied.findings.map(f => f.title)).toContain('Manifest hosted elsewhere')
    const fake = analyzeManifest('https://getgems-mint.app/m.json', check('{"url":"https://getgems-mint.app","name":"Getgems","iconUrl":"https://getgems-mint.app/i.svg"}', { finalUrl: 'https://getgems-mint.app/m.json' }))
    expect(fake.findings.map(f => f.title)).toEqual(expect.arrayContaining(['Look-alike app', 'SVG icon']))
    expect(analyzeManifest('https://x.io/m.json', check('<html>')).findings[0]!.title).toBe('Manifest is not JSON')
  })
})
