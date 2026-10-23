import type { TupleItem } from '@ton/core'
import { Address, beginCell, TupleReader } from '@ton/core'

/** TEP-74 get_wallet_address(slice owner_address) argument. */
export function ownerStack(owner: Address): TupleItem[] {
  return [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }]
}

/** get_wallet_address returns one slice with the jetton wallet address. */
export function walletFromStack(stack: TupleItem[]): Address {
  return new TupleReader(stack).readAddress()
}

export interface OwnerLine {
  line: number
  input: string
  address?: Address
  error?: string
}

/** One owner per line; the first field that parses as an address is used (CSV/TSV is fine). Blank and # lines skipped. */
export function parseOwners(text: string): OwnerLine[] {
  const out: OwnerLine[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const fields = line.split(/[\s,;]+/).map(f => f.replace(/^["']|["']$/g, '')).filter(Boolean)
    for (const f of fields) {
      try {
        out.push({ line: i + 1, input: f, address: Address.parse(f) })
        return
      }
      catch { /* try next field */ }
    }
    // A header row ("owner,label") on the first line is not an error.
    if (!out.length && i === text.split(/\r?\n/).findIndex(l => l.trim())) return
    out.push({ line: i + 1, input: line, error: 'No valid TON address on this line' })
  })
  return out
}

/** toncenter v3 /account fields needed to emulate the master locally. */
export interface MasterState {
  code: string | null
  data: string | null
  balance: string
  status: string
}
