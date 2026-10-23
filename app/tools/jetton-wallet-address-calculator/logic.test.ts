import { Address, serializeTuple } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import masters from './masters.fixture.json'
import { ownerStack, parseOwners, walletFromStack } from './logic'

// masters.fixture.json: toncenter GET /api/v3/account?address=<master> (code, data), 2026-10-22, for USD₮ and NOT.
// Expected wallets are independent: tonapi GET /v2/jettons/<master>/holders (owner -> jetton wallet `address`) and
// tonapi GET /v2/blockchain/accounts/<USD₮>/methods/get_wallet_address (on-chain getter).
const VECTORS = {
  usdt: [
    ['0:23fa979918f1fe702db9100bf843e87c7015eccd39a4721e9b6bac170bc04ce3', '0:2626cf30b702bdded845efc883efa45029ff59defdacc4ce7b8b0a5966d75002'], // tether-treasury.ton
    ['0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309', '0:bb699fbf1bfb567929f4199d07725c19bc6201a7e091ad2b1b3226d31cdea5e2'], // Binance Hot Wallet
    ['0:4a1c20bc9a6f9294f75f1c87a7f383a8b73a483a2e6dcb3630ddbe78b3ccad00', '0:8a359bbdf0a2362a1f67f8e9c38a68ff1c27b8298d4484c4905be3e6660ac18c'], // Bybit 10
    ['0:00b2cc7a1de4af4f515949fd7106eccf6ad22081c514a8a3fc2e64649356d3f8', '0:78d61b24557ffbed0dc306f1a1d015360c623062c94c3cdde678f0f6081640e6'], // toncenter /jetton/wallets
    ['0:ed169130705004711eb998b561d8de82d31fbf84910ced6eb5fc92e7485ef8a7', '0:4ad2ac88ebe22eca43deddb21843745964e388f90b3453bba451abb83f26b0b4'] // tonapi getter
  ],
  not: [
    ['0:f8b8635d0786b77f9da660e65fd31d670a675dd4302facba692f46b571eb5360', '0:7da639a8e77eca737f0ca8101b368d1dc4c7630301c0092aed01dc7a5c998a0a'],
    ['0:cf7ea235ed6f6517edce98026ef7618e9f6d81a1331d4e65ba718e2cd15f80ad', '0:6d53a26839d358a924ea0c9217069512f384c5b6b36536a62c4c9ab02a0c4435'],
    ['0:3791a10cfca22538579d9a3a648b98b56e95bdcbde08fd1e1dba647d9f258df3', '0:2354aa689eba7d1c500faf329620f5e90e06f74b3ffc3e5cfa8348748ad81381']
  ]
} as const

async function emulate(m: keyof typeof masters, owner: string) {
  const s = masters[m]
  const res = await sandboxHandlers.runGetMethod({
    code: s.code,
    data: s.data,
    address: s.address,
    method: 'get_wallet_address',
    stack: serializeTuple(ownerStack(Address.parse(owner))).toBoc().toString('base64'),
    balance: s.balance
  })
  if (!res.output.success) throw new Error(res.output.error)
  expect(res.output.vm_exit_code).toBe(0)
  const { parseTuple, Cell } = await import('@ton/core')
  return walletFromStack(parseTuple(Cell.fromBase64(res.output.stack))).toRawString()
}

describe('get_wallet_address emulated on real master state', () => {
  it.each(VECTORS.usdt)('USD₮ owner %s', async (owner, wallet) => {
    expect(await emulate('usdt', owner)).toBe(wallet)
  }, 60_000)
  it.each(VECTORS.not)('NOT owner %s', async (owner, wallet) => {
    expect(await emulate('not', owner)).toBe(wallet)
  }, 60_000)
})

describe('parseOwners', () => {
  it('reads one owner per line from plain lists and CSV', () => {
    const r = parseOwners('owner,label\nUQAAssx6HeSvT1FZSf1xBuzPatIggcUUqKP8LmRkk1bT-JLR, locked\n\n# comment\n"0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309";binance\nnot an address')
    expect(r).toHaveLength(3)
    expect(r[0]!.address!.toRawString()).toBe('0:00b2cc7a1de4af4f515949fd7106eccf6ad22081c514a8a3fc2e64649356d3f8')
    expect(r[1]!.line).toBe(5)
    expect(r[2]).toMatchObject({ line: 6, error: expect.any(String) })
  })
})
