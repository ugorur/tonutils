// Mintless airdrop tree builder. The Merkle/dictionary code is shared with mintless-claim in ~/lib/jettons-dev/mintless.
import type { Address, Cell } from '@ton/core'
import type { BuiltAirdrop, ClaimApiResponse } from '~/lib/jettons-dev/mintless'
import { claimApiResponse } from '~/lib/jettons-dev/mintless'

export {
  buildAirdrop, claimApiResponse, claimPayload, libraryCell, mintlessWalletInit, MINTLESS_WALLET_CODE_HASH,
  parseAirdropCsv, parseClaim, parseTime, proofFor
} from '~/lib/jettons-dev/mintless'
export type { AirdropRow, BuiltAirdrop, ClaimApiResponse } from '~/lib/jettons-dev/mintless'

/** Above this the page still works but building takes a while (all work is in the main thread, in yielding chunks). */
export const LARGE_LIST = 50_000

/**
 * Builds the TEP-176 API answer for every owner, yielding to the UI every `chunk` rows.
 * ponytail: main-thread with setTimeout yields; move to a Web Worker if lists of millions are needed.
 */
export async function buildApiDump(
  built: BuiltAirdrop, master: Address, code: Cell | undefined,
  onProgress?: (done: number, total: number) => void, chunk = 500
): Promise<Record<string, ClaimApiResponse>> {
  const keys = built.dict.keys()
  const out: Record<string, ClaimApiResponse> = {}
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!
    out[k.toRawString()] = claimApiResponse(built, k, master, code)
    if ((i + 1) % chunk === 0) {
      onProgress?.(i + 1, keys.length)
      await new Promise(r => setTimeout(r, 0))
    }
  }
  onProgress?.(keys.length, keys.length)
  return out
}

/** Sample list of real mainnet wallets (USD₮ holders): two rows use the default dates, one has its own. */
export const EXAMPLE_CSV = `address,amount,start_from,expire_at
UQCqy4q_Cw8f2YjSwTRKpnx458-vs8Z_ESp1VGp5eHcYBFGn,1500
UQBQI1N8Z5_mJ0gqm8LFeGq6S-j5dkrFXgjeMBf-vtOlD21Z,250.75
0:2f8958649e6e026fd8e988815c7d29114a8dd8dbc300ac738ec9156c5207d308,42,2026-11-01,2027-01-01
`
