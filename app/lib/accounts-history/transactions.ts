// toncenter v3 /transactions: types, paging and the per-transaction balance change. Pure TS.
import type { V3Fetch } from './state'

export interface V3Message {
  source: string | null
  destination: string | null
  value: string | null
  fwd_fee: string | null
  bounced?: boolean | null
}

export interface V3Transaction {
  account: string
  hash: string
  lt: string
  now: number
  total_fees: string
  orig_status: string
  end_status: string
  mc_block_seqno: number
  in_msg: V3Message | null
  out_msgs: V3Message[]
  account_state_before?: { balance: string | null, code_hash?: string | null, data_hash?: string | null } | null
  account_state_after?: { balance: string | null } | null
  description?: { aborted?: boolean }
}

const big = (v: string | null | undefined) => (v ? BigInt(v) : 0n)

/** Value an internal incoming message credited (external messages carry no value). */
export function txReceived(tx: V3Transaction): bigint {
  return tx.in_msg?.source ? big(tx.in_msg.value) : 0n
}

/** Value of outgoing messages. */
export function txSent(tx: V3Transaction): bigint {
  return tx.out_msgs.reduce((s, m) => s + big(m.value), 0n)
}

/** Everything the account paid to the network in this transaction: gas, storage, import and forwarding fees. */
export function txFees(tx: V3Transaction): bigint {
  return big(tx.total_fees) + tx.out_msgs.reduce((s, m) => s + big(m.fwd_fee), 0n)
}

/**
 * Exact balance change of the account in this transaction:
 * received − sent − total_fees − forwarding fees of outgoing messages.
 * (Checked against toncenter's account_state_before/after balances on mainnet; those are often null, this never is.)
 */
export function txBalanceDelta(tx: V3Transaction): bigint {
  return txReceived(tx) - txSent(tx) - txFees(tx)
}

export interface PageOptions {
  /** Max transactions per request (toncenter allows 1000). */
  pageSize?: number
  /** Stop after this many pages; the result is then `truncated`. */
  maxPages?: number
  onPage?: (loaded: number) => void
  signal?: { aborted: boolean }
}

/**
 * All transactions of `account` matching `query` (oldest first), paged with offset.
 * Each page costs one request (~1 s on the keyless API).
 */
export async function fetchTransactions(
  v3: V3Fetch,
  account: string,
  query: Record<string, string | number | undefined>,
  { pageSize = 1000, maxPages = 10, onPage, signal }: PageOptions = {}
): Promise<{ transactions: V3Transaction[], truncated: boolean }> {
  const out: V3Transaction[] = []
  for (let page = 0; page < maxPages; page++) {
    if (signal?.aborted) return { transactions: out, truncated: true }
    const r = await v3<{ transactions: V3Transaction[] }>('transactions', { account, ...query, sort: 'asc', limit: pageSize, offset: page * pageSize })
    out.push(...r.transactions)
    onPage?.(out.length)
    if (r.transactions.length < pageSize) return { transactions: out, truncated: false }
  }
  return { transactions: out, truncated: true }
}
