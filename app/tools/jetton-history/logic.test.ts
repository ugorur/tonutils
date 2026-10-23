import { describe, expect, it } from 'vitest'
import { txHashHex } from '~/utils/ton/explorers'
import fixtures from './fixtures.json'
import type { TonapiJettonEvent } from './logic'
import { filterRows, historyRows, netChange } from './logic'

// fixtures.json: tonapi GET /v2/accounts/{owner}/jettons/{USD₮ master}/history, fetched 2026-10-22,
// trimmed (images, previews dropped). Owners: a wallet that burned USD₮, a wallet locked by Tether,
// the recipient of one of its transfers, Binance and OKX hot wallets.
const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
const ev = (k: keyof typeof fixtures) => fixtures[k].events as unknown as TonapiJettonEvent[]

describe('historyRows', () => {
  it('reads burns, failed and self transfers, comments', () => {
    const rows = historyRows(ev('burnOwner'), fixtures.burnOwner.owner, USDT)
    expect(rows.map(r => `${r.direction}:${r.failed ? 'failed' : 'ok'}`)).toEqual(['burn:failed', 'self:failed', 'self:failed', 'out:ok', 'out:ok'])
    expect(rows[0]).toMatchObject({ amount: 9999999000000n, time: 1789642046 })
    // Same burn in toncenter /api/v3/jetton/burns?jetton_master=USD₮: transaction_hash Z+/+xBws8tloEjwPa7T7DnUdDJThRY5f8M0NnkGsHI4=
    expect(rows[0]!.txHash).toBe(txHashHex('Z+/+xBws8tloEjwPa7T7DnUdDJThRY5f8M0NnkGsHI4='))
    expect(rows[3]).toMatchObject({ amount: 94000000n, counterparty: { address: '0:c186fa4d3fb743a52572c3bc09b23ac1da9ffa7a0824402cef8d61df6891c7a4' } })
    expect(rows[4]!.comment).toBe('Call: 0xb7b2515f')
  })

  it('sees the same transfer as incoming on the recipient side', () => {
    const rows = historyRows(ev('recipient'), fixtures.recipient.owner, USDT)
    const inbound = rows.find(r => r.eventId.startsWith('9d873fbf9a61'))!
    expect(inbound).toMatchObject({ direction: 'in', amount: 94000000n, failed: false, counterparty: { name: 'nnnnnnnnnn.ton' } })
  })

  it('keeps text comments (OKX withdrawal memo)', () => {
    const [row] = historyRows(ev('okx'), fixtures.okx.owner, USDT)
    expect(row).toMatchObject({ direction: 'out', amount: 165622000n, comment: '724859072', txHash: 'bf8e22a0e01903613558497baf85102f4da17fe951a97cdb8337e42694d8b935' })
  })

  it('flags transfers the locked wallet could not send', () => {
    const [row] = historyRows(ev('lockedOwner'), fixtures.lockedOwner.owner, USDT)
    expect(row).toMatchObject({ direction: 'out', failed: true, amount: 100000000n })
  })

  it('ignores other jettons', () => {
    expect(historyRows(ev('okx'), fixtures.okx.owner, '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc')).toEqual([])
  })
})

describe('filters and totals', () => {
  it('splits by direction and sums only successful rows', () => {
    const rows = [
      ...historyRows(ev('burnOwner'), fixtures.burnOwner.owner, USDT)
    ]
    expect(filterRows(rows, 'failed')).toHaveLength(3)
    expect(filterRows(rows, 'burn')).toHaveLength(1)
    expect(filterRows(rows, 'out')).toHaveLength(2)
    expect(filterRows(rows, 'in')).toHaveLength(0)
    expect(netChange(rows)).toEqual({ received: 0n, sent: 94000000n + 90000n })
    const inRows = historyRows(ev('recipient'), fixtures.recipient.owner, USDT)
    expect(netChange(inRows).received).toBe(94000000n)
  })
})
