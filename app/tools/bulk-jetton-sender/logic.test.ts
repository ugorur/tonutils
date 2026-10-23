import { Address, type Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { checkRows, parseRecipientsCsv } from '~/lib/bulk-actions/recipients'
import type { TonapiAccount } from '~/lib/wallet-actions/core'
import { toOwnedJetton } from '~/lib/wallet-actions/core'
import { parseBoc } from '~/utils/ton/messages'
import { ATTACHED, buildBulkJettonMessages, jettonNotes } from './logic'

// On-chain vector (toncenter v3 /jetton/transfers + /transactions, read 2026-10-22): USD₮ transfer from
// 0:0c8c0fb5…36f1 to Fragment 0:852443f8…283a, tx Agdx6rZcmfjgRWkV0KvoI5N1tMO8tL2nNEgYq4IVuYc=.
// The sender's jetton wallet 0:8b74bb49…8380 received 0.05 GRAM, bounce=true, with this body:
const ONCHAIN_BODY = 'te6cckEBAgEAfwABqA+KfqX1VcdUyiGLVTq6lQgBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHUAAyMD7V1I4qqhEqJs263VGNZ5OQCl7y+V0wFYR2ITzbxCAwEATAAAAAA3NTAgVGVsZWdyYW0gU3RhcnMgCgpSZWYjcmJXb3JTaDZa6+MN3A=='
const OWNER = Address.parse('0:0C8C0FB575238AAA844A89B36EB7546359E4E40297BCBE574C05611D884F36F1')
const JETTON_WALLET = '0:8b74bb499279da86b219fe9a91ec0f339c68a908d08e48c7e24458ae015e8380'
// tonapi /v2/accounts/_bulk, 2026-10-22.
const FRAGMENT: TonapiAccount = { address: '0:852443f8599fe6a5da34fe43049ac4e0beb3071bb2bfb56635ea9421287c283a', status: 'active', interfaces: ['wallet_highload_v3r1'], name: 'Fragment', is_scam: false, memo_required: false, is_wallet: true }
const accounts = new Map([[FRAGMENT.address, FRAGMENT]])

describe('buildBulkJettonMessages', () => {
  it('reproduces the on-chain USD₮ transfer body, destination, bounce flag and attached GRAM', () => {
    const rows = checkRows(parseRecipientsCsv('EQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2,11.25', { decimals: 6 }), accounts, { purpose: 'jetton', testnet: false })
    rows[0]!.comment = '750 Telegram Stars \n\nRef#rbWorSh6Z' // multi-line comment as sent on chain
    const [m, ...rest] = buildBulkJettonMessages({ rows, jettonWallet: JETTON_WALLET, owner: OWNER, testnet: false, queryId0: 17678255079295126357n })
    expect(rest).toEqual([])
    expect(m!.amount).toBe(50_000_000n)
    expect(ATTACHED).toBe(50_000_000n)
    const dest = Address.parseFriendly(m!.address)
    expect([dest.isBounceable, dest.address.toRawString()]).toEqual([true, JETTON_WALLET])
    expect((m!.payload as Cell).hash().equals(parseBoc(ONCHAIN_BODY).hash())).toBe(true)
  })

  it('gives every row its own query id and sends nothing while a row is blocked', () => {
    const csv = 'EQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2,1\nEQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2,2,hi'
    const rows = checkRows(parseRecipientsCsv(csv, { decimals: 6 }), accounts, { purpose: 'jetton', testnet: false })
    const msgs = buildBulkJettonMessages({ rows, jettonWallet: JETTON_WALLET, owner: OWNER, testnet: false, queryId0: 100n })
    const qids = msgs.map(m => (m.payload as Cell).beginParse().skip(32).loadUintBig(64))
    expect(qids).toEqual([100n, 101n])
    const blocked = checkRows(parseRecipientsCsv(`${csv}\nEQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs,1`, { decimals: 6 }), accounts, { purpose: 'jetton', testnet: false })
    expect(buildBulkJettonMessages({ rows: blocked, jettonWallet: JETTON_WALLET, owner: OWNER, testnet: false, queryId0: 1n })).toEqual([])
  })
})

describe('jettonNotes', () => {
  // tonapi /v2/accounts/0:1bf8…3be2/jettons, 2026-10-22 (USD₮ entry, abbreviated).
  const usdt = toOwnedJetton({ balance: '583586', wallet_address: { address: '0:aeddc3beb9e8a56788d4ad0ea2b1543bab2a4fae926be60e9363942361301ab1' }, jetton: { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', name: 'Tether USD', symbol: 'USD₮', decimals: 6, verification: 'whitelist' } })

  it('blocks totals above the balance', () => {
    expect(jettonNotes(usdt, 583_586n)).toEqual([])
    expect(jettonNotes(usdt, 583_587n)[0]).toMatchObject({ level: 'error', text: expect.stringContaining('0.583586') })
  })

  it('blocks unclaimed mintless jettons and subtracts locked amounts', () => {
    const mintless = { ...usdt, needsClaim: true, locked: 500_000n }
    expect(jettonNotes(mintless, 100_000n).map(n => n.level)).toEqual(['error', 'info', 'error'])
  })
})
