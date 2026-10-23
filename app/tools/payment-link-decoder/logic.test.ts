import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { requestFromQuery } from '~/lib/payments/link'
import { USDT_MASTER } from '~/utils/ton/jetton'
import { decode, decodedBin, expiryState, extractLink } from './logic'

// Links from docs.ton.org/ecosystem/wallet-apps/deep-links and docs.tonconsole.com/tonkeeper/deep-linking.
const DOCS_ADDR = 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K'
const EXP_ADDR = 'EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n'
// Fragment (tonapi name), raw from toncenter v3 /jetton/transfers.
const FRAGMENT = '0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a'
// toncenter v3 /transactions on the payer's USD₮ wallet, tx /HfZnMwCHHbMrzD2vAuNMoaammiqx+lfuthSBRbNJjw=: in_msg body
// (jetton_transfer of 15000000 to Fragment, query_id 2006093651853524265, comment "1000 Telegram Stars \n\nRef#vqRBhupAG").
const JETTON_BODY = 'te6cckEBAgEAgAABqA+KfqUb1xOMMOU9KT5OHAgBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHUAJ+g0pbwxJRb9xKGXHZ55RpXc4OURJio9OxjjiozhyOlCAwEATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBRwnd4to='

const ok = (input: string) => {
  const r = decode(input)
  if (!r.ok) throw new Error(r.error)
  return r.link
}

describe('documented link formats', () => {
  it('ton:// with amount and text', () => {
    const l = ok('ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?amount=5000000&text=hello')
    expect(l.source).toBe('ton')
    expect(l.request).toEqual({ to: DOCS_ADDR, amount: 5_000_000n, text: 'hello' })
    expect(l.bounceable).toBe(false)
    expect(l.warnings).toEqual([])
  })
  it('Keeper universal link with expiry, on every documented prefix', () => {
    for (const p of ['https://app.keeperwallet.com/transfer/', 'https://app.tonkeeper.com/transfer/', 'keeper://transfer/', 'tonkeeper://transfer/']) {
      const l = ok(`${p}${EXP_ADDR}?amount=100000&text=test&exp=2147483647`)
      expect(l.source).toBe('keeper')
      expect(l.request).toEqual({ to: EXP_ADDR, amount: 100_000n, text: 'test', exp: 2147483647 })
    }
  })
  it('Tonhub (also after its www redirect), %20 and + both read as spaces', () => {
    expect(ok('https://tonhub.com/transfer/EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n?amount=7000&text=just%20message').request.text).toBe('just message')
    const l = ok(`https://www.tonhub.com/transfer/${EXP_ADDR}?text=just+message`)
    expect(l.source).toBe('tonhub')
    expect(l.request.text).toBe('just message')
  })
  it('jetton transfer (docs scheme ton://transfer/<ADDRESS>?jetton=&amount=&text=)', () => {
    const l = ok(`ton://transfer/${DOCS_ADDR}?jetton=${USDT_MASTER}&amount=25000000&text=Order%20%231042`)
    expect(l.request.jetton).toBe(USDT_MASTER)
    expect(l.request.amount).toBe(25_000_000n)
    expect(l.request.text).toBe('Order #1042')
  })
})

describe('binary body (bin)', () => {
  it('decodes a real jetton_transfer body; base64 "+" survives in the query', () => {
    expect(JETTON_BODY).toContain('+')
    const l = ok(`ton://transfer/${DOCS_ADDR}?amount=50000000&bin=${JETTON_BODY}`)
    const body = decodedBin(l.request)!
    expect(body.name).toBe('jetton_transfer')
    expect(body.fields.amount).toBe(15_000_000n)
    expect(body.fields.query_id).toBe(2006093651853524265n)
    expect(Address.parse(body.fields.destination as string).equals(Address.parse(FRAGMENT))).toBe(true)
    expect(l.request.bin).not.toMatch(/[+/=]/) // normalized to base64url
  })
  it('url-encoded base64 works too', () => {
    const l = ok(`ton://transfer/${DOCS_ADDR}?amount=1&bin=${encodeURIComponent(JETTON_BODY)}`)
    expect(decodedBin(l.request)!.name).toBe('jetton_transfer')
  })
  it('warns: text + bin, bin without amount, init', () => {
    const l = ok(`ton://transfer/${DOCS_ADDR}?text=hi&bin=${encodeURIComponent(JETTON_BODY)}&init=${encodeURIComponent(JETTON_BODY)}`)
    const w = l.warnings.join(' ')
    expect(w).toMatch(/text is ignored/)
    expect(w).toMatch(/no amount/)
    expect(w).toMatch(/deploys a smart contract/)
  })
})

describe('not a payment link', () => {
  it('plain address, TonConnect request, garbage, empty', () => {
    const a = decode(DOCS_ADDR)
    expect(!a.ok && a.kind).toBe('address')
    const tc = decode('tc://?v=2&id=6b8f3e6dce1b0e33b6d4a0a5d1b1d0f3a4a3c1d7e2c9d9b0f2c3e4d5a6b7c8d9&r=%7B%7D&ret=none')
    expect(!tc.ok && tc.kind).toBe('tonconnect')
    expect(decode('https://example.com/pay').ok).toBe(false)
    expect(!decode('').ok && (decode('') as { kind: string }).kind).toBe('empty')
  })
  it('rejects malformed amount / exp / address', () => {
    expect(decode(`ton://transfer/${DOCS_ADDR}?amount=1.5`).ok).toBe(false)
    expect(decode(`ton://transfer/${DOCS_ADDR}?exp=tomorrow`).ok).toBe(false)
    expect(decode('ton://transfer/notanaddress?amount=1').ok).toBe(false)
  })
  it('flags unknown parameters', () => {
    expect(ok(`ton://transfer/${DOCS_ADDR}?amount=1&memo=x`).warnings.join(' ')).toMatch(/memo/)
  })
})

describe('TonUtils links and helpers', () => {
  it('reads checkout/invoice URLs with their extras', () => {
    const l = ok(`https://tonutils.io/tools/hosted-pay-page?to=${DOCS_ADDR}&amount=5000000&text=hello%20world&label=Tip%20jar&testnet=1`)
    expect(l.source).toBe('tonutils')
    expect(l.request).toEqual({ to: DOCS_ADDR, amount: 5_000_000n, text: 'hello world' })
    expect(l.extras).toEqual({ label: 'Tip jar', testnet: true })
    expect(requestFromQuery({ to: DOCS_ADDR, amount: '7', since: '1700000000', dec: '6' })?.extras).toEqual({ since: 1700000000, decimals: 6 })
    expect(requestFromQuery({ amount: '7' })).toBeNull()
  })
  it('pulls the link out of surrounding text', () => {
    expect(extractLink(`Pay here: ton://transfer/${DOCS_ADDR}?amount=1 thanks`)).toBe(`ton://transfer/${DOCS_ADDR}?amount=1`)
  })
  it('expiry state', () => {
    expect(expiryState(undefined)).toEqual({ kind: 'none' })
    expect(expiryState(2147483647, 2147483000).kind).toBe('valid')
    expect(expiryState(1000, 2000)).toMatchObject({ kind: 'expired', seconds: -1000 })
  })
})
