import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { checkRows, detectSeparator, missingAccounts, parseRecipientsCsv, splitLine, totals } from './recipients'

// Account records exactly as tonapi POST /v2/accounts/_bulk returned them on 2026-10-22 (subset of fields).
const W5: TonapiAccount = { address: '0:6215542644f9754b74d23e30b0090577a775843fa83e2cffd393e1b0f7a48394', balance: 69566621, status: 'active', interfaces: ['wallet_v5r1'], is_wallet: true }
const NEW: TonapiAccount = { address: '0:1234567890123456789012345678901234567890123456789012345678901234', balance: 0, status: 'nonexist', is_wallet: true }
const USDT_MASTER: TonapiAccount = { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', balance: 1073000515715, status: 'active', interfaces: ['jetton_master'], name: 'Tether USD', is_scam: false, memo_required: false, is_wallet: false }
const accounts = new Map([W5, NEW, USDT_MASTER].map(a => [a.address, a]))

describe('splitLine / detectSeparator', () => {
  it('splits on the separator and keeps quoted separators', () => {
    expect(splitLine('a, 1.5 ,"hello, world"', ',')).toEqual(['a', '1.5', 'hello, world'])
    expect(splitLine('a;2;"say ""hi"""', ';')).toEqual(['a', '2', 'say "hi"'])
    expect(splitLine('a\t3\tc', '\t')).toEqual(['a', '3', 'c'])
  })
  it('detects tab, semicolon and comma files', () => {
    expect(detectSeparator('a\t1')).toBe('\t')
    expect(detectSeparator('# note\na;1,5;x')).toBe(';') // decimal comma after the separator
    expect(detectSeparator('a,0.7,x;y')).toBe(',')
    expect(detectSeparator('a;1;x')).toBe(';')
    expect(detectSeparator('a,1')).toBe(',')
  })
})

describe('parseRecipientsCsv', () => {
  it('skips the header, blank and # lines, parses amounts exactly and keeps the comment', () => {
    const rows = parseRecipientsCsv('address,amount,comment\n\n# payroll\nUQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m, 0.7 ,67205d378dde9e66f791ddb4;wpaws\n', { decimals: 9 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ line: 4, amount: 700_000_000n, comment: '67205d378dde9e66f791ddb4;wpaws', typedBounceable: false, typedTestOnly: false, error: null })
    expect(rows[0]!.address!.toRawString()).toBe(W5.address)
  })

  it('reads a decimal comma in semicolon files and jetton decimals', () => {
    const rows = parseRecipientsCsv('0:6215542644f9754b74d23e30b0090577a775843fa83e2cffd393e1b0f7a48394;12,5;Bonus', { decimals: 6 })
    expect(rows[0]).toMatchObject({ amount: 12_500_000n, comment: 'Bonus', typedBounceable: null, error: null })
  })

  it('joins extra unquoted cells back into the comment', () => {
    expect(parseRecipientsCsv('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,1,hello, world', { decimals: 9 })[0]!.comment).toBe('hello, world')
  })

  it('uses the default amount and reports bad rows with their line', () => {
    const rows = parseRecipientsCsv([
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m',
      'foundation.ton,1',
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0X,1',
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,-1',
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,0.0000000001'
    ].join('\n'), { decimals: 9, defaultAmount: 250_000_000n })
    expect(rows.map(r => [r.line, r.amount, !!r.error])).toEqual([
      [1, 250_000_000n, false],
      [2, 1_000_000_000n, true],
      [3, 1_000_000_000n, true],
      [4, null, true],
      [5, null, true]
    ])
    expect(rows[1]!.error).toMatch(/names are not resolved/)
    expect(rows[2]!.error).toMatch(/not a TON address/)
    expect(rows[4]!.error).toMatch(/At most 9 decimal places/)
    expect(parseRecipientsCsv('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m', { decimals: 9 })[0]!.error).toMatch(/Missing amount/)
  })
})

describe('checkRows', () => {
  const csv = [
    'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,1',
    // never-used account typed bounceable (EQ): must be sent non-bounceable
    'EQASNFZ4kBI0VniQEjRWeJASNFZ4kBI0VniQEjRWeJASNGWk,2',
    'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs,3',
    'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,4'
  ].join('\n')

  it('chooses the bounce flag from the account status for GRAM transfers', () => {
    const rows = checkRows(parseRecipientsCsv(csv, { decimals: 9 }), accounts, { purpose: 'coin', testnet: false })
    expect(rows.map(r => r.destination)).toEqual([
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m',
      'UQASNFZ4kBI0VniQEjRWeJASNFZ4kBI0VniQEjRWeJASNDhh',
      'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
      'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m'
    ])
    expect(rows[1]!.notes.some(n => /sent non-bounceable/.test(n.text))).toBe(true)
    expect(rows[3]!.notes.some(n => n.level === 'warning' && /line 1/.test(n.text))).toBe(true)
    expect(rows.every(r => !r.blocked)).toBe(true)
    expect(totals(rows)).toEqual({ rows: 4, ready: 4, blocked: 0, amount: 10_000_000_000n })
  })

  it('blocks token transfers to a jetton master and rows whose account is unknown', () => {
    const parsed = parseRecipientsCsv(csv, { decimals: 6 })
    const rows = checkRows(parsed, accounts, { purpose: 'jetton', testnet: false })
    expect(rows.map(r => r.blocked)).toEqual([false, false, true, false])
    const partial = checkRows(parsed, new Map([[W5.address, W5]]), { purpose: 'jetton', testnet: false })
    expect(partial.map(r => r.blocked)).toEqual([false, true, true, false])
    expect(missingAccounts(parsed, new Map([[W5.address, W5]]))).toEqual([NEW.address, USDT_MASTER.address])
  })

  it('blocks a memo-required exchange row without a comment', () => {
    // tonapi /v2/accounts/EQCA1BI4QRZ8qYmskSRDzJmkucGodYRTZCf_b9hckjla6dZl (Kucoin 1), read 2026-10-23: memo_required true.
    const kucoin: TonapiAccount = { address: '0:80d4123841167ca989ac912443cc99a4b9c1a87584536427ff6fd85c92395ae9', status: 'active', interfaces: ['wallet_v3r2'], name: 'Kucoin 1', memo_required: true, is_wallet: true }
    const rows = checkRows(parseRecipientsCsv('EQCA1BI4QRZ8qYmskSRDzJmkucGodYRTZCf_b9hckjla6dZl,1\nEQCA1BI4QRZ8qYmskSRDzJmkucGodYRTZCf_b9hckjla6dZl,1,12345', { decimals: 9 }), new Map([[kucoin.address, kucoin]]), { purpose: 'coin', testnet: false })
    expect(rows.map(r => r.blocked)).toEqual([true, false])
  })

  it('flags a testnet-form address on mainnet and the sender itself', () => {
    const self = Address.parse(W5.address)
    const testForm = self.toString({ testOnly: true, bounceable: false })
    const rows = checkRows(parseRecipientsCsv(`${testForm},1`, { decimals: 9 }), accounts, { purpose: 'coin', testnet: false, self })
    expect(rows[0]!.notes.map(n => n.level)).toEqual(expect.arrayContaining(['warning', 'info']))
    expect(rows[0]!.destination).toBe('UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m')
  })
})

describe('checkRows: governed jetton wallets', () => {
  // tonapi GET /v2/accounts/0:aeddc3be…1ab1 (a USD₮ jetton wallet), 2026-10-23: interfaces ['jetton_wallet_governed'], is_wallet false.
  const USDT_WALLET: TonapiAccount = { address: '0:aeddc3beb9e8a56788d4ad0ea2b1543bab2a4fae926be60e9363942361301ab1', status: 'active', interfaces: ['jetton_wallet_governed'], is_wallet: false }
  const m = new Map([[USDT_WALLET.address, USDT_WALLET]])
  it('blocks a USD₮ jetton wallet as a token recipient, but not as a GRAM recipient', () => {
    const rows = parseRecipientsCsv('EQCu3cO-ueilZ4jUrQ6isVQ7qypPrpJr5g6TY5QjYTAasZpy,1', { decimals: 6 })
    const [jet] = checkRows(rows, m, { purpose: 'jetton', testnet: false })
    expect(jet!.blocked).toBe(true)
    expect(jet!.notes.filter(n => n.level === 'error')).toHaveLength(1)
    expect(checkRows(rows, m, { purpose: 'coin', testnet: false })[0]!.blocked).toBe(false)
  })
})
