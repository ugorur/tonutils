// Supply stats: CoinGecko market data + TON config params 5 (burning) and 14 (block rewards) + balances.
import { Cell } from '@ton/core'

export interface BurningConfig {
  /** Raw "-1:…" address; coins sent there are destroyed. null when the config sets none. */
  blackhole: string | null
  num: number
  denom: number
  /** num / denom: share of transaction fees burned instead of paid to validators. */
  share: number
}

/** ConfigParam 5: burning_config#01 blackhole_addr:(Maybe bits256) fee_burn_num:# fee_burn_denom:# */
export function parseBurningConfig(boc: string): BurningConfig {
  const s = Cell.fromBase64(boc).beginParse()
  const tag = s.loadUint(8)
  if (tag !== 0x01) throw new Error(`Unexpected ConfigParam 5 tag 0x${tag.toString(16)}`)
  const blackhole = s.loadBit() ? `-1:${s.loadBuffer(32).toString('hex')}` : null
  const num = s.loadUint(32)
  const denom = s.loadUint(32)
  if (!denom) throw new Error('ConfigParam 5 has fee_burn_denom = 0')
  return { blackhole, num, denom, share: num / denom }
}

export interface BlockRewards {
  /** nanoGRAM created for each masterchain block. */
  masterchain: bigint
  /** nanoGRAM created for each basechain (workchain 0) shard block. */
  basechain: bigint
}

/** ConfigParam 14: block_grams_created#6b masterchain_block_fee:Grams basechain_block_fee:Grams */
export function parseBlockRewards(boc: string): BlockRewards {
  const s = Cell.fromBase64(boc).beginParse()
  const tag = s.loadUint(8)
  if (tag !== 0x6b) throw new Error(`Unexpected ConfigParam 14 tag 0x${tag.toString(16)}`)
  return { masterchain: s.loadCoins(), basechain: s.loadCoins() }
}

/** Accounts whose balances show where a big part of the supply sits. Labels match tonkeeper/ton-assets. */
export const ELECTOR = '-1:3333333333333333333333333333333333333333333333333333333333333333'
export const BELIEVERS_FUND = '0:ed1691307050047117b998b561d8de82d31fbf84910ced6eb5fc92e7485ef8a7'

export const HOLDINGS: { raw: string, name: string, hint: string, mainnetOnly?: boolean }[] = [
  { raw: ELECTOR, name: 'Elector contract', hint: 'Stakes of the current and next validator sets, plus pending rewards.' },
  { raw: BELIEVERS_FUND, name: 'TON Believers Fund', hint: 'Locker contract holding coins deposited for a multi-year lock that unlocks gradually.', mainnetOnly: true }
]

/** toncenter v3 /accountStates (fields used). */
export interface AccountStatesResponse {
  accounts: { address: string, balance: string, status: string }[]
}

/** raw lowercase -> nano balance. Accounts missing from the answer are left out. */
export function balancesByRaw(r: AccountStatesResponse): Map<string, bigint> {
  return new Map(r.accounts.map(a => [a.address.toLowerCase(), BigInt(a.balance)]))
}

/** Share of a whole-coin total, as a fraction. */
export function shareOf(nano: bigint, totalCoins: number): number | null {
  if (!(totalCoins > 0)) return null
  return Number(nano) / 1e9 / totalCoins
}
