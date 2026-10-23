import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { chooseBounce } from '~/lib/wallet-actions/core'
import { amountProblem, buildTonTransfer, FEE_RESERVE, maxSendable } from './logic'

// Real mainnet transfer with a memo to Binance's deposit wallet (memo_required on tonapi).
// toncenter v3 /transactions?hash=UgoTHZc2yLlltQdHnMEArwG68gwPluU2VbECBwxPaxM= : in_msg value 41538803,
// bounce true, decoded text_comment "174343631".
const BINANCE = '0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4'
const MEMO_BODY = 'te6cckEBAQEADwAAGgAAAAAxNzQzNDM2MzHWxwqg'

describe('buildTonTransfer', () => {
  it('reproduces the on-chain comment body and keeps the chosen bounce flag', () => {
    const { bounceable } = chooseBounce(null, 'active')
    const destination = Address.parse(BINANCE).toString({ bounceable, urlSafe: true })
    const m = buildTonTransfer({ destination, amount: 41538803n, comment: '174343631' })
    expect(m.address).toBe(destination)
    expect(Address.parseFriendly(m.address).isBounceable).toBe(true)
    expect(m.amount).toBe(41538803n)
    expect((m.payload as Cell).hash().toString('hex')).toBe(Cell.fromBase64(MEMO_BODY).hash().toString('hex'))
  })
  it('sends no body without a comment (blank counts as none)', () => {
    expect(buildTonTransfer({ destination: 'x', amount: 1n, comment: '' }).payload).toBeUndefined()
    expect(buildTonTransfer({ destination: 'x', amount: 1n, comment: '  ' }).payload).toBeUndefined()
  })
})

describe('amount checks', () => {
  const balance = 1_000_000_000n
  it('rejects zero and more than the balance, warns when fees would not fit', () => {
    expect(amountProblem(0n, balance)?.level).toBe('error')
    expect(amountProblem(balance + 1n, balance)?.level).toBe('error')
    expect(amountProblem(balance, balance)?.level).toBe('warning')
    expect(amountProblem(maxSendable(balance), balance)).toBeNull()
    expect(amountProblem(5n, null)).toBeNull()
    expect(amountProblem(null, balance)).toBeNull()
  })
  it('max keeps the fee reserve', () => {
    expect(maxSendable(balance)).toBe(balance - FEE_RESERVE)
    expect(maxSendable(FEE_RESERVE - 1n)).toBe(0n)
  })
})
