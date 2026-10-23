import type { Cell } from '@ton/core'
import { parseBoc } from '~/utils/ton/messages'
import { cellFromApi, hexToBase64, parseAddressOrHash, summarizeCode, type AddressOrHash, type CodeSummary } from '~/lib/contracts-read/cells'

export type ResolverInput = AddressOrHash | { kind: 'boc', cell: Cell }

/** Address (fetch its code), 32-byte library hash, or a code BOC. */
export function parseResolverInput(input: string): ResolverInput {
  try {
    return parseAddressOrHash(input)
  }
  catch (e) {
    try {
      return { kind: 'boc', cell: parseBoc(input) }
    }
    catch {
      throw new Error(input.trim() ? 'Not an address, a 32-byte hash or a BOC. Paste EQ…/0:…, 64 hex characters, or a code BOC (te6cc… / b5ee9c72…).' : (e as Error).message)
    }
  }
}

/** toncenter /api/v2/getLibraries `result` shape. */
export interface LibrariesResult {
  result: { hash: string, data: string }[]
}

/** Query value for toncenter getLibraries: the library hash as standard base64. */
export const libraryQuery = (libraryHashHex: string) => hexToBase64(libraryHashHex)

export interface ResolvedLibrary {
  code: Cell
  boc: string
  summary: CodeSummary
}

/**
 * Picks the entry for `libraryHashHex` from a getLibraries result and checks that the returned code really hashes to it
 * (the library key is the code's own hash, so a mismatch means a broken API answer). Null when the library is not on chain.
 */
export function pickLibrary(res: LibrariesResult, libraryHashHex: string): ResolvedLibrary | null {
  const want = hexToBase64(libraryHashHex)
  const entry = res.result.find(e => e.hash === want)
  if (!entry) return null
  const code = cellFromApi(entry.data)
  const summary = summarizeCode(code)
  if (summary.hashHex !== libraryHashHex) {
    throw new Error(`The API returned code with hash ${summary.hashHex}, not the requested ${libraryHashHex}. Not trusting it.`)
  }
  return { code, boc: entry.data, summary }
}
