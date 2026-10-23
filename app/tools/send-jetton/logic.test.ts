import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { OwnedJetton } from '~/lib/wallet-actions/core'
import { buildJettonSend, sendProblems, spendable } from './logic'

// Real mainnet USD₮ transfers (toncenter v3 /jetton/transfers + /transactions?hash=…, read 2026-10-22).
// Both: query_id 0, forward_ton_amount 1, response_destination = sender, 0.05 GRAM attached to the jetton wallet.
const WITH_COMMENT = {
  tx: 'QrQL4LvWuou4Exx/wC8uykPGTSXSv/9DfWWJX+JVGbM=',
  owner: '0:D6940746EE937B361868AB7120CC06357DB7834CC49D119430A7D58C1BF5EE12',
  jettonWallet: '0:BB53397843950B3815A64B89FA965BA4F2CA15A4E033ED1E2E76DD89426F3929',
  destination: '0:852443F8599FE6A5DA34FE43049AC4E0BEB3071BB2BFB56635EA9421287C283A',
  amount: 750000n,
  comment: '50 Telegram Stars \n\nRef#npWzDJaNC',
  value: 50000000n,
  body: 'te6cckEBAgEAfgABqA+KfqUAAAAAAAAAADC3GwgBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHUANaUB0buk3s2GGircSDMBjV9t4NMxJ0RlDCn1Ywb9e4SCAwEASgAAAAA1MCBUZWxlZ3JhbSBTdGFycyAKClJlZiNucFd6REphTkOLH20V'
}
const NO_COMMENT = {
  tx: 'X6KJ8qgJbZtXfcTYOkqS8QAsuX35ba1saWQvPz72ayA=',
  owner: '0:12DA8E1463DADD778005B9E5DB1A60688E09EBBE071B6277CBB068DB136457FA',
  jettonWallet: '0:02AD8F44595CC91271660A78B9DF855973F72D6A8E59884423FA665445EAA142',
  destination: '0:73D593789203F923645FDAE5FA5DE9A83A71AD94A19508A00013C1972C2167BF',
  amount: 75000000n,
  comment: '',
  value: 50000000n,
  body: 'te6cckEBAQEAVwAAqg+KfqUAAAAAAAAAAEBHhowIAOerJvEkB/JGyL+1y/S701B041spQyoRQAAngy5YQs9/AAS2o4UY9rdd4AFueXbGmBojgnrvgcbYnfLsGjbE2RX+ggIgrizI'
}

describe('buildJettonSend reproduces real USD₮ transfers bit for bit', () => {
  for (const v of [WITH_COMMENT, NO_COMMENT]) {
    it(`tx ${v.tx}`, () => {
      const m = buildJettonSend({
        jettonWallet: v.jettonWallet,
        owner: Address.parse(v.owner),
        destination: Address.parse(v.destination),
        amount: v.amount,
        comment: v.comment,
        queryId: 0n
      })
      expect(m.address).toBe(v.jettonWallet)
      expect(m.amount).toBe(v.value)
      expect((m.payload as Cell).hash().toString('hex')).toBe(Cell.fromBase64(v.body).hash().toString('hex'))
    })
  }
})

describe('sendProblems', () => {
  // USD₮ (6 decimals), wallet + master from the vector above / tonapi.
  const usdt: OwnedJetton = {
    master: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe',
    wallet: WITH_COMMENT.jettonWallet.toLowerCase(),
    name: 'Tether USD',
    symbol: 'USD₮',
    decimals: 6,
    verification: 'whitelist',
    balance: 1_000_000n,
    needsClaim: false,
    locked: 0n
  }
  const ok = { coinBalance: 1_000_000_000n }
  it('passes a normal transfer', () => {
    expect(sendProblems(usdt, 750000n, ok)).toEqual([])
  })
  it('blocks over-balance, zero, missing gas and sending to the token contracts', () => {
    expect(sendProblems(usdt, 1_000_001n, ok).map(p => p.level)).toEqual(['error'])
    expect(sendProblems(usdt, 0n, ok).map(p => p.level)).toEqual(['error'])
    expect(sendProblems(usdt, 1n, { coinBalance: 40_000_000n }).map(p => p.level)).toEqual(['error'])
    expect(sendProblems(usdt, 1n, { ...ok, destination: Address.parse(usdt.master) }).map(p => p.level)).toEqual(['error'])
    expect(sendProblems(usdt, 1n, { ...ok, destination: Address.parse(usdt.wallet) }).map(p => p.level)).toEqual(['error'])
  })
  it('respects locked balances, unclaimed mintless tokens and spam flags', () => {
    const locked = { ...usdt, locked: 400_000n }
    expect(spendable(locked)).toBe(600_000n)
    expect(sendProblems(locked, 700_000n, ok).map(p => p.level)).toEqual(['error'])
    expect(sendProblems({ ...usdt, needsClaim: true }, 1n, ok).map(p => p.level)).toEqual(['error'])
    expect(sendProblems({ ...usdt, verification: 'blacklist' }, 1n, ok).map(p => p.level)).toEqual(['warning'])
  })
})
