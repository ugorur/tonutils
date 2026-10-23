// Transaction decoder: a raw transaction BOC is parsed locally; a hash (or explorer link) is looked up on
// toncenter v3 (tx hash, then inbound message hash) and its raw BOC fetched from v2 to cross-check the parse.
import type { TonNetwork } from '~/composables/useTonNetwork'
import { findTransaction, parseTxInput, rawTransactions, type ToncenterLike } from '~/lib/tx-dev/lookup'
import { txFromBoc, txFromV3, type TxView } from '~/lib/tx-dev/txview'
import { detectWalletVersion } from '~/utils/ton/wallets'

export interface DecodeResult {
  view: TxView
  source: 'boc' | 'toncenter'
  /** Raw transaction BOC (pasted, or fetched from toncenter v2). */
  raw: string | null
  /** Our BOC parse gave the same hash as the indexer (null: not checked). */
  verified: boolean | null
  /** The pasted hash was the inbound message hash. */
  viaMessage: boolean
  /** Wallet version of the account before the transaction (adds wallet exit code meanings). */
  walletVersion: string | null
  mcSeqno: number | null
}

export async function decodeTransaction(input: string, tc: ToncenterLike, network: TonNetwork): Promise<DecodeResult> {
  const testOnly = network === 'testnet'
  const parsed = parseTxInput(input)
  if (parsed.kind === 'boc') {
    return { view: txFromBoc(parsed.boc, { testOnly }), source: 'boc', raw: parsed.boc.trim(), verified: null, viaMessage: false, walletVersion: null, mcSeqno: null }
  }
  const found = await findTransaction(tc, parsed.b64)
  if (!found) throw new Error(`No transaction or inbound message with this hash on ${network}. Check the network switch in the header, or wait a few seconds if it was just sent.`)
  const { tx, viaMessage } = found
  const view = txFromV3(tx, testOnly)
  let raw: string | null = null
  let verified: boolean | null = null
  try {
    raw = (await rawTransactions(tc, tx.account, tx.lt, tx.hash, 1))[0]?.raw ?? null
    if (raw) verified = txFromBoc(raw).hash === tx.hash
  }
  catch {
    // The raw BOC is a bonus (liteserver lookups can fail for old transactions); the indexed view stands.
  }
  const codeHash = tx.account_state_before?.code_hash
  return {
    view, source: 'toncenter', raw, verified, viaMessage,
    walletVersion: codeHash ? detectWalletVersion(codeHash)?.version ?? null : null,
    mcSeqno: tx.mc_block_seqno ?? null
  }
}
