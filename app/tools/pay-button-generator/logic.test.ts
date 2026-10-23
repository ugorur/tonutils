import { describe, expect, it } from 'vitest'
import { buttonHtml, defaultLabel, escapeHtml, markdownLink, previewDoc, targetUrl } from './logic'

// Links: docs.ton.org/ecosystem/wallet-apps/deep-links examples (amount + text, address as published).
const DOCS_ADDR = 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K'
const req = { to: DOCS_ADDR, amount: 5_000_000n, text: 'hello' }

describe('targetUrl', () => {
  it('wallet links and the public checkout page', () => {
    expect(targetUrl(req, 'ton')).toBe(`ton://transfer/${DOCS_ADDR}?amount=5000000&text=hello`)
    expect(targetUrl(req, 'keeper')).toBe(`https://app.tonkeeper.com/transfer/${DOCS_ADDR}?amount=5000000&text=hello`)
    expect(targetUrl(req, 'hosted', { label: 'Tip' })).toBe(`https://tonutils.io/tools/hosted-pay-page?to=${DOCS_ADDR}&amount=5000000&text=hello&label=Tip`)
  })
})

describe('escaping (OWASP XSS prevention: escape & < > " \' in content and quoted attributes)', () => {
  it('escapeHtml', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
  })
  it('button never lets the label or URL break out', () => {
    const html = buttonHtml({ href: 'https://x/?a=1&b="><img src=x onerror=alert(1)>', label: '<b>Pay</b>', theme: 'blue', size: 'md', pill: false, newTab: true })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('href="https://x/?a=1&amp;b=&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"')
    expect(html).toContain('<span>&lt;b&gt;Pay&lt;/b&gt;</span>')
  })
})

describe('buttonHtml', () => {
  const base = { href: targetUrl(req, 'keeper'), label: 'Pay 0.005 GRAM', theme: 'blue' as const, size: 'md' as const, pill: false, newTab: true }
  it('a single <a> with inline styles, no scripts', () => {
    const html = buttonHtml(base)
    expect(html).toContain(`<a href="https://app.tonkeeper.com/transfer/${DOCS_ADDR}?amount=5000000&amp;text=hello" target="_blank" rel="noopener noreferrer"`)
    expect(html).toContain('background:#0098EA')
    expect(html).not.toMatch(/<script|on\w+=/i)
    expect(html.match(/<a /g)).toHaveLength(1)
  })
  it('options change the output', () => {
    expect(buttonHtml({ ...base, newTab: false })).not.toContain('target=')
    expect(buttonHtml({ ...base, pill: true })).toContain('border-radius:999px')
    expect(buttonHtml({ ...base, theme: 'light', size: 'lg' })).toMatch(/background:#FFFFFF.*font:600 18px/)
  })
  it('QR variant wraps the svg and the button', () => {
    const html = buttonHtml({ ...base, qrSvg: '<svg id="q"></svg>' })
    expect(html).toMatch(/<div style="display:inline-flex;flex-direction:column[^"]*">\n<div[^>]*><svg id="q"><\/svg><\/div>\n<a /)
  })
})

describe('markdown, labels, preview', () => {
  it('markdown link escapes brackets and parentheses', () => {
    expect(markdownLink('Pay [now]', 'https://a/b(c)')).toBe('[Pay \\[now\\]](https://a/b%28c%29)')
  })
  it('default label', () => {
    expect(defaultLabel('5 GRAM', 'GRAM')).toBe('Pay 5 GRAM')
    expect(defaultLabel(null, 'USD₮')).toBe('Pay with USD₮')
  })
  it('preview document has no script', () => {
    expect(previewDoc('<a>x</a>', true)).toMatch(/background:#0B0B0D.*<body><a>x<\/a><\/body>/)
    expect(previewDoc('<a>x</a>', false)).not.toContain('<script')
  })
})
