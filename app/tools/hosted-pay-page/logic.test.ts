import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { parsePaymentLink } from '~/lib/payments/link'
import { specFor } from '~/lib/payments/match'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { USDT_MASTER } from '~/utils/ton/jetton'
import { FORWARD_TON, newQueryId, payBlocker, paymentMessage } from './logic'

// Real mainnet USD₮ payment to Fragment: toncenter v3 /transactions, tx /HfZnMwCHHbMrzD2vAuNMoaammiqx+lfuthSBRbNJjw=
// (in_msg body of the payer's USD₮ jetton wallet): jetton_transfer query_id 2006093651853524265, 15000000 units,
// destination Fragment, response_destination = payer, forward_ton_amount 1, comment in a ref cell.
const JETTON_BODY = 'te6cckEBAgEAgAABqA+KfqUb1xOMMOU9KT5OHAgBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHUAJ+g0pbwxJRb9xKGXHZ55RpXc4OURJio9OxjjiozhyOlCAwEATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBRwnd4to='
// Its forward payload (the comment cell alone), as toncenter shows it.
const COMMENT_CELL = 'te6cckEBAQEAKQAATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBR7skUgg='
const COMMENT = '1000 Telegram Stars \n\nRef#vqRBhupAG'
const FRAGMENT = 'EQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2'
const PAYER = Address.parse('0:9fa0d296f0c4945bf712865c7679e51a577383944498a8f4ec638e2a338723a5')
// tonapi /v2/accounts/{PAYER}/jettons/{USDT_MASTER} -> wallet_address.
const PAYER_USDT_WALLET = '0:113ff0a255b84a54056b63320ceb7c886da2c4dc0d5c00cae10dca48784174b3'

const cellOf = (p: unknown) => p as Cell

describe('paymentMessage', () => {
  it('USD₮ payment reproduces the real on-chain jetton_transfer bit for bit', () => {
    const m = paymentMessage({ to: FRAGMENT, jetton: USDT_MASTER, amount: 15_000_000n, text: COMMENT }, { amount: 15_000_000n, payer: PAYER, jettonWallet: PAYER_USDT_WALLET, queryId: 2006093651853524265n })
    expect(m.address).toBe(PAYER_USDT_WALLET)
    expect(m.amount).toBe(TOKEN_GAS)
    expect(FORWARD_TON).toBe(1n)
    expect(cellOf(m.payload).hash().equals(Cell.fromBase64(JETTON_BODY).hash())).toBe(true)
  })
  it('coin payment: recipient keeps its flag, comment cell matches the real one', () => {
    const m = paymentMessage({ to: FRAGMENT, amount: 567_200_000n, text: COMMENT }, { amount: 567_200_000n, payer: PAYER })
    expect(m).toMatchObject({ address: FRAGMENT, amount: 567_200_000n })
    expect(cellOf(m.payload).hash().equals(Cell.fromBase64(COMMENT_CELL).hash())).toBe(true)
  })
  it('no comment = no payload; bin from a link is attached as the body', () => {
    expect(paymentMessage({ to: FRAGMENT }, { amount: 1n, payer: PAYER }).payload).toBeUndefined()
    const l = parsePaymentLink(`ton://transfer/${FRAGMENT}?amount=5&bin=${encodeURIComponent(COMMENT_CELL)}`)
    if (!l.ok) throw new Error(l.error)
    const m = paymentMessage(l.link.request, { amount: 5n, payer: PAYER })
    expect(cellOf(m.payload).hash().equals(Cell.fromBase64(COMMENT_CELL).hash())).toBe(true)
  })
  it('jetton without the payer jetton wallet throws', () => {
    expect(() => paymentMessage({ to: FRAGMENT, jetton: USDT_MASTER }, { amount: 1n, payer: PAYER })).toThrow()
  })
})

describe('payBlocker', () => {
  const r = { to: FRAGMENT, amount: 5n }
  it('allows a normal payment', () => {
    expect(payBlocker(r, { amount: 5n })).toBeNull()
  })
  it('blocks expired, missing amount, jetton+bin, low token balance', () => {
    expect(payBlocker({ ...r, exp: 100 }, { amount: 5n, now: 200 })).toMatch(/expired/)
    expect(payBlocker({ to: FRAGMENT }, { amount: null })).toMatch(/amount/)
    expect(payBlocker({ to: FRAGMENT }, { amount: 0n })).toMatch(/amount/)
    expect(payBlocker({ ...r, jetton: USDT_MASTER, bin: 'x' }, { amount: 5n })).toMatch(/binary body/)
    expect(payBlocker({ ...r, jetton: USDT_MASTER }, { amount: 5n, jettonBalance: 4n })).toMatch(/enough/)
  })
  it('watch spec matches what is sent: comment first, else exact amount', () => {
    expect(specFor({ to: FRAGMENT, text: COMMENT, amount: 5n }, 10)).toMatchObject({ text: COMMENT, amount: 5n, since: 10 })
  })
})

it('newQueryId packs 8 random bytes big-endian', () => {
  expect(newQueryId(() => new Uint8Array([0x1b, 0xd7, 0x13, 0x8c, 0x30, 0xe5, 0x3d, 0x29]))).toBe(2006093651853524265n)
})
