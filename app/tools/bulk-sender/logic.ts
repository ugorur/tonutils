// Bulk GRAM transfer: one TonConnect message per checked recipient row.
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { CheckedRow } from '~/lib/bulk-actions/recipients'
import { commentBody } from '~/utils/ton/messages'

/**
 * Messages for every row that passed the checks, in list order. The bounce flag is already in
 * `destination` (non-bounceable for accounts that were never used, so coins do not bounce back).
 * Returns [] while any row is blocked: a payout list is sent complete or not at all.
 */
export function buildBulkTonMessages(rows: CheckedRow[]): TonConnectMessage[] {
  if (!rows.length || rows.some(r => r.blocked)) return []
  return rows.map(r => ({
    address: r.destination!,
    amount: r.amount!,
    payload: r.comment ? commentBody(r.comment) : undefined
  }))
}
