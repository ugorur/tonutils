// Read helpers and TonConnect batching shared by the nfts-write tools. Pure TS (no @ton/*, no Vue).
import { rateLimitedJson } from '~/utils/api-client'

// ---------------------------------------------------------------- TonConnect batching

type Feature = string | { name: string, maxMessages?: number }

/** Messages the connected wallet accepts in one request (device.features SendTransaction.maxMessages; 4 if it does not say). */
export function maxMessagesOf(device: { features?: Feature[] } | null | undefined): number {
  const f = device?.features?.find((x): x is { name: string, maxMessages?: number } => typeof x === 'object' && x.name === 'SendTransaction')
  return f?.maxMessages && f.maxMessages > 0 ? f.maxMessages : 4
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---------------------------------------------------------------- toncenter

export interface AccountState {
  address: string
  status: string
  balance: string
  code_hash?: string
  data_hash?: string
  code_boc?: string
  data_boc?: string
}

type V3 = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

/** toncenter v3 accountStates for many addresses (comma-separated, 100 per call). Keyed by uppercase raw address. */
export async function accountStates(v3: V3, addresses: string[], includeBoc = false): Promise<Map<string, AccountState>> {
  const out = new Map<string, AccountState>()
  for (const part of chunk([...new Set(addresses)], 100)) {
    const r = await v3<{ accounts: AccountState[] }>('accountStates', { address: part.join(','), include_boc: includeBoc })
    for (const a of r.accounts) out.set(a.address.toUpperCase(), a)
  }
  return out
}

export interface StackEntry { type: string, value: unknown }

/** toncenter v3 POST runGetMethod through the shared rate-limited queue. Throws on a non-zero exit code. */
export async function runGetMethod(baseUrl: string, address: string, method: string, stack: StackEntry[] = []): Promise<StackEntry[]> {
  const r = await rateLimitedJson<{ exit_code: number, stack: StackEntry[] }>(
    `${baseUrl}/v3/runGetMethod`,
    { provider: 'toncenter' },
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, method, stack }) }
  )
  if (r.exit_code !== 0 && r.exit_code !== 1) {
    throw new Error(r.exit_code === -13 || r.exit_code === 11
      ? `This contract has no ${method} get-method (exit code ${r.exit_code}).`
      : `${method} failed with exit code ${r.exit_code}. The account may not be deployed or is not this kind of contract.`)
  }
  return r.stack
}

// ---------------------------------------------------------------- tonapi NFTs

export interface TonapiAccountRef { address: string, name?: string, is_scam?: boolean, is_wallet?: boolean }

export interface TonapiNft {
  address: string
  index: number
  owner?: TonapiAccountRef
  collection?: { address: string, name?: string }
  verified?: boolean
  metadata: Record<string, unknown> & { name?: string, image?: string, description?: string }
  sale?: {
    address: string
    market: TonapiAccountRef
    owner?: TonapiAccountRef
    price: { value: string, decimals?: number, token_name?: string, currency_type?: string, jetton?: string }
  }
  previews?: { resolution: string, url: string }[]
  approved_by?: string[]
  trust?: 'whitelist' | 'graylist' | 'blacklist' | 'none' | string
  dns?: string
}

type Get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => Promise<T>

/** All NFTs of an account from tonapi, 100 per page (the keyless cap). indirect = include NFTs sitting in sale contracts. */
export async function fetchAccountNfts(get: Get, address: string, opts: { indirect?: boolean, maxItems?: number, onPage?: (count: number) => void } = {}): Promise<{ items: TonapiNft[], truncated: boolean }> {
  const { indirect = false, maxItems = 1000, onPage } = opts
  const items: TonapiNft[] = []
  for (let offset = 0; offset < maxItems; offset += 100) {
    const r = await get<{ nft_items: TonapiNft[] }>(`accounts/${encodeURIComponent(address)}/nfts`, { limit: 100, offset, indirect_ownership: indirect })
    items.push(...r.nft_items)
    onPage?.(items.length)
    if (r.nft_items.length < 100) return { items, truncated: false }
  }
  return { items, truncated: true }
}

/** Smallest tonapi preview of at least the wanted size. */
export function previewUrl(nft: Pick<TonapiNft, 'previews'>, min = 100): string | undefined {
  const sized = (nft.previews ?? []).map(p => ({ url: p.url, w: Number(p.resolution.split('x')[0]) || 0 }))
  return (sized.find(p => p.w >= min) ?? sized.at(-1))?.url
}
