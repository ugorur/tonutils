import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { OwnedJetton } from '~/lib/wallet-actions/core'
import { buildBurn, burnPlan } from './logic'

// Real mainnet burns (toncenter v3 /jetton/burns + /transactions?hash=…, read 2026-10-22):
// amount, query_id and response_destination (= owner) as indexed; body = in_msg of the jetton wallet tx.
const BURNS = [
  {
    tx: 'i4lVNT5St3DviB1Ps3Z8Df/FqDqLMG5ImrG5Y7R0WV4=',
    owner: '0:3F2A977081938290416ADB1ADEE12E4B6C7B2BF0ABA5D2A5DF488E41D7EF57DE',
    jettonWallet: '0:54B8BCB42574C47675EA7D09430FCD5C86D84796A13516F47A0C6487318EED83',
    amount: 174174331n,
    queryId: 0n,
    body: 'te6cckEBAQEANAAAZFlfB7wAAAAAAAAAAECmGwe4AH5VLuEDJwUggtW2Nb3CXJbY9lfhV0ulS76RHIOv3q+8lUOKuA=='
  },
  {
    tx: 'cCJSzMJSSTRYuOtdYyQ9mXsoSHDB3c6vYWbn4ZxOyyU=',
    owner: '0:2D049CD9017B8E41F50A6EE0A5731D8AA344CB252463BC6AE978C61742C157AE',
    jettonWallet: '0:2DBF7D61901A0F8F788DB9DFCBC7E329618A63003DDAFC0F7108DCB8A5906C36',
    amount: 200000000000n,
    queryId: 1792698976180n,
    body: 'te6cckEBAQEANQAAZllfB7wAAAGhZS+HtFLpDt0ACABaCTmyAvccg+oU3cFK5jsVRomWSkjHeNXS8YwuhYKvXHetHGI='
  }
]

describe('buildBurn reproduces real burns bit for bit', () => {
  for (const v of BURNS) {
    it(`tx ${v.tx}`, () => {
      const m = buildBurn({ jettonWallet: v.jettonWallet, owner: Address.parse(v.owner), amount: v.amount, queryId: v.queryId })
      expect(m.address).toBe(v.jettonWallet)
      expect(m.amount).toBe(50_000_000n)
      expect((m.payload as Cell).hash().toString('hex')).toBe(Cell.fromBase64(v.body).hash().toString('hex'))
    })
  }
})

describe('burnPlan', () => {
  // Two tokens from TON Foundation's wallet (tonapi /v2/accounts/{id}/jettons, 2026-10-22).
  const nvb: OwnedJetton = { master: '0:749ed6c9ecda14f077203687f24327e609bc959decff92b36166f4097e8d9183', wallet: '0:da4ecce819f637e2fd7fb8ee26c406088db2df84205f215eec6b88611cbb91fd', name: 'Nova BIT', symbol: 'NVB', decimals: 9, verification: 'blacklist', balance: 1000000000n, needsClaim: false, locked: 0n }
  const jusdt: OwnedJetton = { master: '0:729c13b6df2c07cbf0a06ab63d34af454f3d320ec1bcd8fb5c6d24d0806a17c2', wallet: '0:99277a41a11e70704b4e16c4af2fd435edac72e41f9e3992c4f2efafd050bf9a', name: 'jUSDT', symbol: 'jUSDT', decimals: 6, verification: 'whitelist', balance: 1100000n, needsClaim: false, locked: 0n }
  const rich = { coinBalance: 10n ** 9n }

  it('burns the whole balance of each spam token without warnings', () => {
    const p = burnPlan([nvb], rich)
    expect(p.items).toEqual([{ jetton: nvb, amount: 1000000000n }])
    expect(p.notes).toEqual([])
  })
  it('warns before burning a verified token and honours a custom amount for one token', () => {
    const p = burnPlan([jusdt], { ...rich, customAmount: 100000n })
    expect(p.items[0]!.amount).toBe(100000n)
    expect(p.notes.map(n => n.level)).toEqual(['warning'])
    expect(burnPlan([jusdt], { ...rich, customAmount: 2000000n }).notes.map(n => n.level)).toEqual(['error'])
  })
  it('skips unburnable tokens and checks fee money per token', () => {
    const p = burnPlan([nvb, { ...jusdt, balance: 0n }, { ...nvb, master: 'x', needsClaim: true }], rich)
    expect(p.items.length).toBe(1)
    expect(p.notes.map(n => n.level)).toEqual(['warning', 'warning'])
    expect(burnPlan([nvb, jusdt], { coinBalance: 60_000_000n }).notes.map(n => n.level)).toEqual(['warning', 'error'])
  })
  it('burns only the unlocked part', () => {
    expect(burnPlan([{ ...nvb, locked: 400000000n }], rich).items[0]!.amount).toBe(600000000n)
  })
})
