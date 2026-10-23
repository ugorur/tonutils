// Finding a transaction from what a user pastes (hash, explorer link, message hash, raw BOC), through toncenter.
// Pure TS: the toncenter client is passed in (useToncenter() in the browser, a fake in tests).
import type { V3Tx } from './txview'

export type TxInput =
  | { kind: 'hash', b64: string, hex: string }
  | { kind: 'boc', boc: string }

const hexToB64 = (hex: string) => btoa(String.fromCharCode(...hex.match(/../g)!.map(h => parseInt(h, 16))))
const b64ToHex = (b64: string) => Array.from(atob(b64), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

/** Accepts a 64-hex / base64 / base64url hash, a Tonviewer / Tonscan / tonscan.com link, or a BOC. Throws readable errors. */
export function parseTxInput(input: string): TxInput {
  const s = input.trim()
  if (!s) throw new Error('Paste a transaction hash, an explorer link or a transaction BOC.')
  if (/^(te6cc|b5ee9c72)/i.test(s)) return { kind: 'boc', boc: s }
  // Explorer links: take the hash-shaped path segment (tonscan.org/tx/<lt:hash:addr> forms also carry one).
  const candidates = /^https?:\/\//i.test(s) ? urlSegments(s) : [s]
  for (const c of candidates) {
    if (/^[0-9a-f]{64}$/i.test(c)) return { kind: 'hash', hex: c.toLowerCase(), b64: hexToB64(c.toLowerCase()) }
    if (/^[A-Za-z0-9+/_-]{43}=?$/.test(c)) {
      const b64 = c.replace(/-/g, '+').replace(/_/g, '/').replace(/=?$/, '=')
      return { kind: 'hash', b64, hex: b64ToHex(b64) }
    }
  }
  throw new Error('That does not look like a transaction hash (64 hex or 44 base64 characters), an explorer link or a BOC.')
}

function urlSegments(s: string): string[] {
  try {
    return decodeURIComponent(new URL(s).pathname).split(/[/:]/)
  }
  catch {
    return [] // malformed link: falls through to the readable error
  }
}

export interface ToncenterLike {
  v2<T>(method: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>
  v3<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T>
}

export interface FoundTx {
  tx: V3Tx
  /** True when the pasted hash was the hash of the inbound message, not of the transaction. */
  viaMessage: boolean
}

/** Looks a hash up as a transaction hash first, then as an inbound message hash. Null when neither exists. */
export async function findTransaction(tc: ToncenterLike, hashB64: string): Promise<FoundTx | null> {
  const byTx = await tc.v3<{ transactions: V3Tx[] }>('transactions', { hash: hashB64, limit: 1 })
  if (byTx.transactions[0]) return { tx: byTx.transactions[0], viaMessage: false }
  const byMsg = await tc.v3<{ transactions: V3Tx[] }>('transactionsByMessage', { msg_hash: hashB64, direction: 'in', limit: 1 })
  if (byMsg.transactions[0]) return { tx: byMsg.transactions[0], viaMessage: true }
  return null
}

interface V2Tx { transaction_id: { lt: string, hash: string }, data: string }

/** Raw BOCs of an account's transactions, newest first, starting at (and including) the given one. */
export async function rawTransactions(tc: ToncenterLike, account: string, lt: string, hashB64: string, limit: number): Promise<{ lt: bigint, hash: string, raw: string }[]> {
  const list = await tc.v2<V2Tx[]>('getTransactions', { address: account, lt, hash: hashB64, limit })
  return list.map(t => ({ lt: BigInt(t.transaction_id.lt), hash: t.transaction_id.hash, raw: t.data }))
}
