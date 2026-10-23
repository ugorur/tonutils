import { describe, expect, it } from 'vitest'
import { appDomain, buildManifest, checkHosted, checkIcon, checkManifest, domainBindingOk, manifestUrlFrom } from './logic'
// Real manifests, fetched with curl on 2026-10-23 from the URLs in each test.
import dedust from './fixtures/dedust.json'
import demo from './fixtures/demo-dapp.json'
import fragment from './fixtures/fragment.json'
import ston from './fixtures/ston-fi.json'

const levels = (c: { level: string }[]) => c.map(x => x.level)
const titles = (c: { title: string }[]) => c.map(x => x.title).join(' | ')

// The example manifest from ton-connect spec/manifest.md § Example.
const SPEC_EXAMPLE = {
  url: 'https://example.com',
  name: 'Example App',
  iconUrl: 'https://example.com/icon-180.png',
  termsOfUseUrl: 'https://example.com/terms',
  privacyPolicyUrl: 'https://example.com/privacy'
}

describe('checkManifest', () => {
  it('accepts the spec example with no errors or warnings', () => {
    const c = checkManifest(SPEC_EXAMPLE)
    expect(c[0]).toMatchObject({ level: 'ok' })
    expect(levels(c)).not.toContain('error')
    expect(levels(c)).not.toContain('warn')
    expect(titles(c)).toContain('App domain: example.com')
  })

  it('Fragment (fragment.com/tonconnect-manifest.json) is clean', () => {
    const c = checkManifest(fragment)
    expect(levels(c).filter(l => l === 'error' || l === 'warn')).toEqual([])
  })

  it('TonConnect demo dApp: trailing slash on url is a warning (spec: SHOULD NOT)', () => {
    const c = checkManifest(demo)
    expect(demo.url).toBe('https://ton-connect.github.io/demo-dapp-with-react-ui/')
    expect(c.filter(x => x.level === 'warn').map(x => x.title)).toEqual(['"url" ends with a slash'])
    expect(appDomain(demo)).toBe('ton-connect.github.io')
  })

  it('STON.fi: JPEG icon is a warning (PNG/ICO are the interoperable formats)', () => {
    const c = checkManifest(ston)
    expect(c.find(x => x.level === 'warn')?.title).toBe('Icon is a .jpg file')
    expect(levels(c)).not.toContain('error')
  })

  it('DeDust: required fields only, no optional ones, is fine', () => {
    expect(levels(checkManifest(dedust))).not.toContain('error')
  })

  it('missing fields, http URLs, SVG icons and the reserved version field are errors', () => {
    const c = checkManifest({ url: 'http://example.com', iconUrl: 'https://example.com/i.svg', version: 2 })
    const t = titles(c.filter(x => x.level === 'error'))
    expect(t).toContain('Missing required field "name"')
    expect(t).toContain('"url" is not an https:// URL')
    expect(t).toContain('Icon is an SVG')
    expect(t).toContain('Remove the "version" field')
  })

  it('names without a dot (reserved for native wallets, e.g. "tonkeeper") are rejected', () => {
    expect(domainBindingOk('tonkeeper')).toBe(false)
    expect(domainBindingOk('app.ston.fi')).toBe(true)
    expect(domainBindingOk('.com')).toBe(false)
    expect(titles(checkManifest({ ...SPEC_EXAMPLE, url: 'https://tonkeeper' }))).toContain('App domain is not a public domain name')
  })

  it('reports unknown fields as info and rejects non-objects', () => {
    expect(checkManifest({ ...SPEC_EXAMPLE, foo: 1 }).some(x => x.level === 'info' && x.title.includes('foo'))).toBe(true)
    expect(checkManifest([1])[0]?.level).toBe('error')
    expect(checkManifest('x')[0]?.level).toBe('error')
  })
})

describe('buildManifest', () => {
  it('reproduces the spec example and drops the trailing slash and empty optional fields', () => {
    expect(JSON.parse(buildManifest(SPEC_EXAMPLE))).toEqual(SPEC_EXAMPLE)
    const out = JSON.parse(buildManifest({ url: ' https://example.com/ ', name: 'Example App', iconUrl: 'https://example.com/icon-180.png', termsOfUseUrl: '  ' }))
    expect(out).toEqual({ url: 'https://example.com', name: 'Example App', iconUrl: 'https://example.com/icon-180.png' })
  })
})

describe('manifestUrlFrom', () => {
  it('keeps manifest URLs and maps sites to /tonconnect-manifest.json', () => {
    expect(manifestUrlFrom('https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json')).toBe('https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json')
    expect(manifestUrlFrom('fragment.com')).toBe('https://fragment.com/tonconnect-manifest.json')
    expect(manifestUrlFrom('https://app.ston.fi/swap')).toBe('https://app.ston.fi/tonconnect-manifest.json')
    expect(manifestUrlFrom('https://getgems.io/tcm?v=2')).toBe('https://getgems.io/tcm?v=2')
    expect(() => manifestUrlFrom('')).toThrow()
    expect(() => manifestUrlFrom('ftp://x.com/a.json')).toThrow()
  })
})

describe('checkHosted', () => {
  const ok = { requestedUrl: 'https://fragment.com/tonconnect-manifest.json', status: 200, finalUrl: 'https://fragment.com/tonconnect-manifest.json', redirected: false, contentType: 'application/json; charset=utf-8', cacheControl: null, body: JSON.stringify(fragment) }

  it('a reachable JSON manifest passes with an info about caching', () => {
    const r = checkHosted(ok)
    expect(r.manifest?.name).toBe('Fragment')
    expect(levels(r.checks)).not.toContain('error')
    expect(titles(r.checks)).toContain('No Cache-Control header')
  })

  it('a CORS/network failure is an error (STON.fi serves no Access-Control-Allow-Origin, checked with curl)', () => {
    const r = checkHosted({ requestedUrl: 'https://app.ston.fi/tonconnect-manifest.json', status: null, error: 'Failed to fetch' })
    expect(r.manifest).toBeNull()
    expect(r.checks[0]).toMatchObject({ level: 'error', title: 'Your browser could not read the manifest' })
  })

  it('404, wrong content type, redirects and broken JSON are reported', () => {
    expect(titles(checkHosted({ ...ok, status: 404 }).checks)).toContain('HTTP 404')
    expect(titles(checkHosted({ ...ok, contentType: 'text/html' }).checks)).toContain('Content-Type is "text/html"')
    expect(titles(checkHosted({ ...ok, redirected: true, finalUrl: 'https://www.fragment.com/tonconnect-manifest.json' }).checks)).toContain('The manifest URL redirects')
    expect(titles(checkHosted({ ...ok, body: '{"url":' }).checks)).toContain('Not valid JSON')
  })

  it('notes a manifest hosted away from the app domain (demo dApp on GitHub Pages is not, but a CDN copy is)', () => {
    const r = checkHosted({ ...ok, requestedUrl: 'https://cdn.example.net/m.json', finalUrl: 'https://cdn.example.net/m.json' })
    expect(titles(r.checks)).toContain('Manifest is hosted on another domain')
  })
})

describe('checkIcon', () => {
  it('180×180 PNG (Fragment and demo dApp icons, checked with `file`) is ok', () => {
    expect(checkIcon({ width: 180, height: 180, contentType: 'image/png' })).toEqual([{ level: 'ok', title: 'Icon is 180×180' }])
  })
  it('DeDust 384×384 PNG gets a size note; JPEG, SVG, non-square and load failures are flagged', () => {
    expect(checkIcon({ width: 384, height: 384, contentType: 'image/png' })[0]?.level).toBe('info')
    expect(checkIcon({ width: 180, height: 180, contentType: 'image/jpeg' })[0]?.level).toBe('warn')
    expect(checkIcon({ width: 180, height: 180, contentType: 'image/svg+xml' })[0]?.level).toBe('error')
    expect(checkIcon({ width: 200, height: 100 })[0]?.title).toContain('not square')
    expect(checkIcon({ width: null, height: null })[0]?.level).toBe('warn')
  })
})
