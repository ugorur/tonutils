import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { emptyDraft } from '~/lib/payments/form'
import { hostedUrl, newInvoiceId, requestQuery } from '~/lib/payments/link'
import { USDT_MASTER } from '~/utils/ton/jetton'
import { buildLink, generate, qrFilename } from './logic'

// Expected links are the examples published in the wallet docs:
//   docs.ton.org/ecosystem/wallet-apps/deep-links ("GRAM transfer with amount and text comment", "expiry timestamp")
//   docs.tonconsole.com/tonkeeper/deep-linking (Keeper expiry example, Tonhub examples with %20)
const DOCS_ADDR = 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K'
const EXP_ADDR = 'EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n'
const draft = (p: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), ...p })

describe('generate: documented link examples', () => {
  it('amount + text (docs.ton.org)', () => {
    const g = generate(draft({ to: DOCS_ADDR, amount: '0.005', text: 'hello' }))
    expect(g.links.find(l => l.kind === 'ton')?.url).toBe('ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?amount=5000000&text=hello')
  })
  it('expiry (docs.ton.org + Keeper docs, same path on app.tonkeeper.com)', () => {
    const g = generate(draft({ to: EXP_ADDR, amount: '0.0001', text: 'test', exp: 2147483647 }), { now: 1_800_000_000 })
    expect(g.links.find(l => l.kind === 'ton')?.url).toBe('ton://transfer/EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n?amount=100000&text=test&exp=2147483647')
    expect(g.links.find(l => l.kind === 'keeper')?.url).toBe('https://app.tonkeeper.com/transfer/EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n?amount=100000&text=test&exp=2147483647')
  })
  it('Tonhub encodes spaces as %20 (Tonhub docs example)', () => {
    const g = generate(draft({ to: EXP_ADDR, amount: '0.000007', text: 'just message' }))
    expect(g.links.find(l => l.kind === 'tonhub')?.url).toBe('https://tonhub.com/transfer/EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n?amount=7000&text=just%20message')
  })
  it('plain address link (docs.ton.org)', () => {
    expect(generate(draft({ to: DOCS_ADDR })).links[0]!.url).toBe('ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K')
  })
  it('USD₮: amount in micro-units (1 USD₮ = 10^6, docs.ton.org jetton transfer), no Tonhub link', () => {
    const g = generate(draft({ to: DOCS_ADDR, asset: USDT_MASTER, amount: '25', text: 'Order #1042' }))
    expect(g.links.map(l => l.kind)).toEqual(['ton', 'keeper'])
    expect(g.links[0]!.url).toBe(`ton://transfer/${DOCS_ADDR}?jetton=${USDT_MASTER}&amount=25000000&text=Order%20%231042`)
  })
  it('bin replaces text and is base64url (real Fragment comment cell, toncenter tx /HfZnMwC…)', () => {
    const boc = 'te6cckEBAQEAKQAATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBR7skUgg='
    const g = generate(draft({ to: DOCS_ADDR, amount: '1', text: 'ignored', bin: boc }))
    expect(g.request?.text).toBeUndefined()
    const url = new URL(g.links[0]!.url.replace('ton://', 'https://x/'))
    expect(url.searchParams.get('bin')).not.toMatch(/[+/=]/)
    expect(Buffer.from(url.searchParams.get('bin')!, 'base64url').toString('base64')).toBe(Buffer.from(boc, 'base64').toString('base64'))
    expect(g.warnings.join(' ')).toMatch(/replaces the text comment/)
  })
})

describe('generate: validation', () => {
  // Raw form of DOCS_ADDR from tonapi /v2/address/{id}/parse and toncenter detectAddress.
  it('raw address becomes non-bounceable UQ…; friendly keeps its flags', () => {
    const raw = '0:d8cd999fb2b1b384e6ca254c3883375e23111a8b78c015b886286c31bf11e29d'
    expect(generate(draft({ to: raw })).request?.to).toBe(DOCS_ADDR)
    expect(generate(draft({ to: EXP_ADDR })).request?.to).toBe(EXP_ADDR)
  })
  it('reports bad input instead of building', () => {
    expect(generate(draft({ to: 'nope' })).errors.to).toBeTruthy()
    expect(generate(draft({ to: DOCS_ADDR, amount: '1.0000000001' })).errors.amount).toBeTruthy()
    expect(generate(draft({ to: DOCS_ADDR, amount: '0' })).errors.amount).toMatch(/greater than zero/)
    expect(generate(draft({ to: DOCS_ADDR, asset: 'custom', customJetton: 'x' })).errors.jetton).toBeTruthy()
    expect(generate(draft({ to: DOCS_ADDR, bin: 'te6cc' })).errors.bin).toBeTruthy()
    expect(generate(draft({ to: DOCS_ADDR, bin: 'te6cckEBAQEAKQAATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBR7skUgg=' })).errors.amount).toMatch(/needs an amount/)
    expect(generate(draft({ to: DOCS_ADDR, exp: 100 }), { now: 200 }).errors.exp).toBeTruthy()
    expect(generate(draft({ to: DOCS_ADDR }), { requireAmount: true }).errors.amount).toBeTruthy()
  })
  it('warns about a testnet address on mainnet', () => {
    const testnetForm = Address.parse(DOCS_ADDR).toString({ testOnly: true, bounceable: false })
    expect(generate(draft({ to: testnetForm })).warnings.join(' ')).toMatch(/testnet address/)
  })
  it('custom jetton uses its decimals', () => {
    const g = generate(draft({ to: DOCS_ADDR, asset: 'custom', customJetton: USDT_MASTER, decimals: '6', amount: '1.5' }))
    expect(g.request?.amount).toBe(1_500_000n)
  })
})

describe('share URLs and helpers', () => {
  it('hosted checkout reuses the link parameter names', () => {
    const r = { to: DOCS_ADDR, amount: 5_000_000n, text: 'hello world' }
    expect(hostedUrl(r, { testnet: true, label: 'Tip jar' })).toBe(`https://tonutils.io/tools/hosted-pay-page?to=${DOCS_ADDR}&amount=5000000&text=hello%20world&label=Tip%20jar&testnet=1`)
    expect(requestQuery({ to: DOCS_ADDR, jetton: USDT_MASTER }, { decimals: 6 })).not.toContain('dec=') // known jetton
    expect(buildLink(r, 'ton')).toContain('text=hello%20world')
  })
  it('invoice ids are INV- + 8 unambiguous characters', () => {
    expect(newInvoiceId(() => new Uint8Array([0, 1, 2, 3, 28, 29, 30, 31]))).toBe('INV-2345WXYZ')
    expect(newInvoiceId()).toMatch(/^INV-[2-9A-HJ-NP-Z]{8}$/)
  })
  it('QR file name is file-system safe', () => {
    expect(qrFilename(DOCS_ADDR, '25', 'USD₮')).toBe('pay-UQDYzZ-25-USD')
  })
})
