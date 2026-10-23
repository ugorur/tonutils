import { describe, expect, it } from 'vitest'
import fx from '~/lib/tx-dev/fixtures/transactions.json'
import type { ToncenterLike } from '~/lib/tx-dev/lookup'
import { parseTxInput } from '~/lib/tx-dev/lookup'
import { decodeTransaction } from './logic'

// Real mainnet transactions (toncenter v3 JSON + v2 raw BOC, see the fixture's _source). The fake toncenter
// serves them the way the real API does: v3 transactions?hash=, v3 transactionsByMessage?msg_hash=, v2 getTransactions.
const all = [fx.walletV4, fx.walletV4Excess, fx.usdtMasterExit9, fx.jettonWalletLib, fx.bounced]
const calls: string[] = []
const tc: ToncenterLike = {
  async v3<T>(path: string, q: Record<string, unknown> = {}) {
    calls.push(path)
    const hit = path === 'transactions'
      ? all.filter(c => c.v3.hash === q.hash)
      : all.filter(c => (c.v3.in_msg as { hash?: string } | null)?.hash === q.msg_hash)
    return { transactions: hit.map(c => c.v3) } as T
  },
  async v2<T>(method: string, q: Record<string, unknown> = {}) {
    calls.push(method)
    const c = all.find(c => c.v3.lt === q.lt && c.v3.hash === q.hash)!
    return [{ transaction_id: { lt: c.v3.lt, hash: c.v3.hash }, data: c.raw }] as T
  }
}

const hex = (b64: string) => Buffer.from(b64, 'base64').toString('hex')

describe('decodeTransaction', () => {
  it('by tx hash (hex): indexed view, raw BOC cross-checked, wallet version from code hash', async () => {
    const r = await decodeTransaction(hex(fx.walletV4.v3.hash), tc, 'mainnet')
    expect(r).toMatchObject({ source: 'toncenter', verified: true, viaMessage: false, walletVersion: 'v4r2', mcSeqno: 100678679, raw: fx.walletV4.raw })
    expect(r.view.hash).toBe(fx.walletV4.v3.hash)
    expect(r.view.outMsgs[0]!.decoded?.name).toBe('jetton_transfer')
  })

  it('by inbound message hash: falls back to transactionsByMessage', async () => {
    calls.length = 0
    const r = await decodeTransaction(fx.bounced.v3.in_msg.hash, tc, 'mainnet')
    expect(calls.slice(0, 2)).toEqual(['transactions', 'transactionsByMessage'])
    expect(r.viaMessage).toBe(true)
    expect(r.view.hash).toBe(fx.bounced.v3.hash)
    expect(r.view.bounce?.type).toBe('ok')
  })

  it('pasted BOC: parsed locally, no requests', async () => {
    calls.length = 0
    const r = await decodeTransaction(fx.usdtMasterExit9.raw, tc, 'mainnet')
    expect(calls).toEqual([])
    expect(r.source).toBe('boc')
    expect(r.view.compute).toMatchObject({ success: false, exitCode: 9 })
  })

  it('unknown hash: explains the network switch', async () => {
    await expect(decodeTransaction('a'.repeat(64), tc, 'testnet')).rejects.toThrow(/on testnet/)
  })
})

describe('parseTxInput', () => {
  const h = hex(fx.walletV4.v3.hash)
  it.each([
    [h],
    [h.toUpperCase()],
    [fx.walletV4.v3.hash],
    [fx.walletV4.v3.hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=$/, '')],
    [`https://tonviewer.com/transaction/${h}`],
    [`https://testnet.tonviewer.com/transaction/${h}?section=trace`],
    [`https://tonscan.org/tx/${h}`],
    [`https://tonscan.org/tx/${encodeURIComponent(fx.walletV4.v3.hash)}`],
    [`https://tonscan.com/transactions/${h}`]
  ])('%s', (input) => {
    expect(parseTxInput(input)).toEqual({ kind: 'hash', hex: h, b64: fx.walletV4.v3.hash })
  })

  it('BOCs and junk', () => {
    expect(parseTxInput(' te6cckEB… ').kind).toBe('boc')
    expect(() => parseTxInput('')).toThrow(/Paste/)
    expect(() => parseTxInput('hello')).toThrow(/does not look like/)
    expect(() => parseTxInput('https://')).toThrow(/does not look like/)
    expect(() => parseTxInput('https://tonviewer.com/%E0%A4%A')).toThrow(/does not look like/)
  })
})

