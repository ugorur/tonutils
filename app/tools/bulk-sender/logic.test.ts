import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { feeReserve, balanceNote } from '~/lib/bulk-actions/fees'
import { checkRows, parseRecipientsCsv } from '~/lib/bulk-actions/recipients'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { parseBoc } from '~/utils/ton/messages'
import { buildBulkTonMessages } from './logic'

// On-chain vector: W5 wallet 0:28de0dbd…625c, tx LelzhgPPrb+xiJfVLtLNw8RpLmk1ord6rV6ee5GhTkw= (toncenter v3
// /transactions, read 2026-10-22). Its out message: 0.7 GRAM to 0:62155426…8394, bounce=false, text comment.
const ONCHAIN_BODY = 'te6cckEBAQEAJAAARAAAAAA2NzIwNWQzNzhkZGU5ZTY2Zjc5MWRkYjQ7d3Bhd3O9vDLp'
// tonapi /v2/accounts/_bulk, 2026-10-22.
const accounts = new Map<string, TonapiAccount>([
  ['0:6215542644f9754b74d23e30b0090577a775843fa83e2cffd393e1b0f7a48394', { address: '0:6215542644f9754b74d23e30b0090577a775843fa83e2cffd393e1b0f7a48394', status: 'active', interfaces: ['wallet_v5r1'], is_wallet: true }],
  ['0:1234567890123456789012345678901234567890123456789012345678901234', { address: '0:1234567890123456789012345678901234567890123456789012345678901234', status: 'nonexist', is_wallet: true }]
])

describe('buildBulkTonMessages', () => {
  it('reproduces the on-chain message: destination, non-bounceable flag, amount and comment body', () => {
    const rows = checkRows(parseRecipientsCsv('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,0.7,67205d378dde9e66f791ddb4;wpaws', { decimals: 9 }), accounts, { purpose: 'coin', testnet: false })
    const [m] = buildBulkTonMessages(rows)
    expect(m!.address).toBe('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m')
    expect(m!.amount).toBe(700_000_000n)
    const payload = m!.payload as import('@ton/core').Cell
    expect(payload.hash().equals(parseBoc(ONCHAIN_BODY).hash())).toBe(true)
  })

  it('omits the body without a comment, keeps list order, and sends nothing while a row is blocked', () => {
    const csv = 'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,1\nEQASNFZ4kBI0VniQEjRWeJASNFZ4kBI0VniQEjRWeJASNGWk,0.5,hi'
    const msgs = buildBulkTonMessages(checkRows(parseRecipientsCsv(csv, { decimals: 9 }), accounts, { purpose: 'coin', testnet: false }))
    expect(msgs.map(m => [m.address, m.amount, m.payload === undefined])).toEqual([
      ['UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m', 1_000_000_000n, true],
      ['UQASNFZ4kBI0VniQEjRWeJASNFZ4kBI0VniQEjRWeJASNDhh', 500_000_000n, false]
    ])
    const withBad = checkRows(parseRecipientsCsv(`${csv}\nnot-an-address,1`, { decimals: 9 }), accounts, { purpose: 'coin', testnet: false })
    expect(buildBulkTonMessages(withBad)).toEqual([])
  })

  it('uses testnet address forms on testnet', () => {
    const rows = checkRows(parseRecipientsCsv('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,1', { decimals: 9 }), accounts, { purpose: 'coin', testnet: true })
    const f = Address.parseFriendly(buildBulkTonMessages(rows)[0]!.address)
    expect([f.isTestOnly, f.isBounceable, f.address.toRawString()]).toEqual([true, false, '0:6215542644f9754b74d23e30b0090577a775843fa83e2cffd393e1b0f7a48394'])
  })
})

describe('fee reserve and balance note', () => {
  it('scales with approvals and messages', () => {
    expect(feeReserve(0, 4)).toBe(0n)
    expect(feeReserve(10, 4)).toBe(3n * 10_000_000n + 10n * 1_000_000n)
    expect(feeReserve(255, 255)).toBe(10_000_000n + 255_000_000n)
  })
  it('errors when the amount exceeds the balance and warns when fees do not fit', () => {
    expect(balanceNote(1_000n, 2_000n, 0n)?.level).toBe('error')
    expect(balanceNote(1_000_000_000n, 999_000_000n, 10_000_000n)?.level).toBe('warning')
    expect(balanceNote(2_000_000_000n, 1_000_000_000n, 10_000_000n)).toBeNull()
    expect(balanceNote(null, 1n, 1n)).toBeNull()
  })
})
