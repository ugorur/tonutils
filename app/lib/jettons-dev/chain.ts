// Small chain readers for the jettons-dev tools. Go through rateLimitedJson so they share the per-host queue
// with useToncenter/useTonapi (which have no POST helper).
import type { Address } from '@ton/core'
import { Cell } from '@ton/core'
import type { MetaKind } from './metadata'
import { rateLimitedJson } from '~/utils/api-client'

export interface StackEntry { type: string, value: unknown }

/** toncenter v3 POST /runGetMethod. `base` = useToncenter().baseUrl(). Throws on a non-zero exit code. */
export async function runGet(base: string, address: Address | string, method: string, stack: StackEntry[] = []): Promise<StackEntry[]> {
  const res = await rateLimitedJson<{ exit_code: number, stack: StackEntry[] }>(`${base}/v3/runGetMethod`, { provider: 'toncenter' }, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: typeof address === 'string' ? address : address.toRawString(), method, stack })
  })
  if (res.exit_code !== 0 && res.exit_code !== 1) {
    throw new Error(res.exit_code === -13 || res.exit_code === 11
      ? `${method} is not available on this contract (exit code ${res.exit_code})`
      : `${method} failed with exit code ${res.exit_code}`)
  }
  return res.stack
}

/** tonapi POST. `base` = useTonapi().baseUrl(). */
export function tonapiPost<T>(base: string, path: string, body: unknown): Promise<T> {
  return rateLimitedJson<T>(`${base}/${path.replace(/^\//, '')}`, { provider: 'tonapi' }, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export const stackCell = (e: StackEntry | undefined): Cell => {
  if (!e || (e.type !== 'cell' && e.type !== 'slice')) throw new Error('Unexpected get-method result')
  return Cell.fromBase64(String(e.value))
}

/** The full TEP-64 content cell of a jetton master, NFT item (via its collection) or NFT collection. */
export async function fetchContentCell(base: string, address: Address, kind: MetaKind): Promise<{ cell: Cell, collection?: Address | null }> {
  if (kind === 'jetton') return { cell: stackCell((await runGet(base, address, 'get_jetton_data'))[3]) }
  if (kind === 'nft-collection') return { cell: stackCell((await runGet(base, address, 'get_collection_data'))[1]) }
  const data = await runGet(base, address, 'get_nft_data')
  const index = data[1]
  const collection = stackCell(data[2]).beginParse().loadMaybeAddress()
  const individual = data[4]
  if (!collection) return { cell: stackCell(individual), collection: null }
  const full = await runGet(base, collection, 'get_nft_content', [{ type: 'num', value: String(index!.value) }, { type: 'cell', value: individual!.value }])
  return { cell: stackCell(full[0]), collection }
}
