// Plain-language explanations for TVM compute-phase exit codes and action-phase result codes.
// Sources (checked 2026-10-22):
// - TVM and action phase: Tact docs "Exit codes" (tact-lang/tact docs/book/exit-codes.mdx).
// - Wallet v1/v2/v3: ton-blockchain/ton crypto/smartcont/new-wallet.fif, wallet-code.fc, wallet3-code.fc.
// - Wallet v4: ton-blockchain/wallet-contract func/wallet-v4-code.fc.
// - Wallet W5: ton-blockchain/wallet-contract-v5 contracts/wallet_v5.fc.
// - Jetton wallet (TEP-74 reference): ton-blockchain/token-contract ft/jetton-wallet.fc.
// - Governed jetton wallet (USD₮ and other stablecoin-contract tokens): ton-blockchain/stablecoin-contract contracts/op-codes.fc.

export type TxPhase = 'compute' | 'action'

export interface ExitInfo {
  code: number
  phase: TxPhase
  ok: boolean
  title: string
  /** Who defines this code: 'TVM', 'Action phase', or the contract family. */
  source: string
}

const TVM: Record<number, string> = {
  0: 'Success',
  1: 'Success (alternative exit code)',
  2: 'Stack underflow: the contract code read more values than it had',
  3: 'Stack overflow',
  4: 'Integer overflow',
  5: 'Integer out of expected range',
  6: 'Invalid TVM opcode',
  7: 'Type check error: a value had the wrong type',
  8: 'Cell overflow: tried to write more than a cell can hold',
  9: 'Cell underflow: tried to read more than the message or data contains (often a malformed message body)',
  10: 'Dictionary error',
  11: 'Unknown error, may be thrown by the contract itself',
  12: 'Fatal TVM error',
  13: 'Out of gas: the message did not carry enough value to pay for the computation',
  [-14]: 'Out of gas: the message did not carry enough value to pay for the computation',
  14: 'VM virtualization error'
}

const ACTION: Record<number, string> = {
  0: 'Success',
  32: 'Action list is invalid',
  33: 'Action list is too long (more than 255 actions)',
  34: 'Action is invalid or not supported',
  35: 'Invalid source address in an outgoing message',
  36: 'Invalid destination address in an outgoing message',
  37: 'Not enough balance to send the outgoing message (and pay its fees)',
  38: 'Not enough extra currencies',
  39: 'Outgoing message does not fit into a cell after rewriting',
  40: 'Cannot process a message: not enough funds, the message is too large, or its Merkle depth is too big',
  41: 'Library reference is null during a library change',
  42: 'Library change action error',
  43: 'Library limits exceeded (too many cells or Merkle depth too big)',
  50: 'Account state size exceeded limits'
}

// wallet-code.fc (v2) and new-wallet.fif (v1): signature is 34, expiry 35 (v2 only).
const WALLET_V12: Record<number, string> = {
  33: 'Wrong seqno: the message was already processed or another one was sent first',
  34: 'Invalid signature',
  35: 'Message expired (valid_until is in the past)'
}
const WALLET_V3: Record<number, string> = {
  33: 'Wrong seqno: the message was already processed or another one was sent first',
  34: 'Wrong subwallet id',
  35: 'Expired message or invalid signature'
}
const WALLET_V4: Record<number, string> = {
  33: 'Wrong seqno: the message was already processed or another one was sent first',
  34: 'Wrong subwallet id',
  35: 'Invalid signature',
  36: 'Message expired (valid_until is in the past)'
}
const WALLET_V5: Record<number, string> = {
  132: 'Signature authentication is disabled for this wallet',
  133: 'Wrong seqno: the message was already processed or another one was sent first',
  134: 'Wrong wallet id (message signed for another network or subwallet)',
  135: 'Invalid signature',
  136: 'Message expired (valid_until is in the past)',
  137: 'External send message must use the "ignore errors" send mode',
  138: 'Invalid message operation',
  139: 'Could not add extension',
  140: 'Could not remove extension',
  141: 'Unsupported action',
  142: 'Cannot disable signature when there are no extensions',
  143: 'This signature mode is already set',
  144: 'Cannot remove the last extension while signature is disabled',
  145: 'Extension is in the wrong workchain',
  146: 'Only an extension can change the signature mode',
  147: 'Invalid action list (c5)'
}
const JETTON_WALLET: Record<number, string> = {
  705: 'Not the owner: only the wallet owner can send these jettons',
  706: 'Not enough jettons in the sender\'s jetton wallet',
  707: 'Transfer came from an invalid jetton wallet, or not enough value attached for a burn',
  708: 'Forward payload is missing',
  709: 'Not enough value attached to pay the jetton transfer fees',
  65535: 'Unknown operation: the contract does not handle this message'
}
const JETTON_GOVERNED: Record<number, string> = {
  45: 'Jetton wallet is locked by the token administrator',
  47: 'Not enough jettons in the sender\'s jetton wallet',
  48: 'Not enough value attached to pay the jetton transfer fees',
  49: 'Invalid message',
  72: 'Invalid operation',
  73: 'Not the owner: only the wallet owner can send these jettons',
  74: 'Transfer came from an invalid jetton wallet',
  333: 'Wrong workchain',
  65535: 'Unknown operation: the contract does not handle this message'
}

function contractTable(interfaces: string[]): { name: string, table: Record<number, string> } | null {
  const has = (re: RegExp) => interfaces.some(i => re.test(i))
  if (has(/^jetton_wallet_governed/)) return { name: 'Governed jetton wallet (stablecoin contract)', table: JETTON_GOVERNED }
  if (has(/^jetton_wallet/)) return { name: 'Jetton wallet (TEP-74)', table: JETTON_WALLET }
  if (has(/^wallet_v5/)) return { name: 'Wallet W5', table: WALLET_V5 }
  if (has(/^wallet_v4/)) return { name: 'Wallet v4', table: WALLET_V4 }
  if (has(/^wallet_v3/)) return { name: 'Wallet v3', table: WALLET_V3 }
  if (has(/^wallet_v[12]/)) return { name: 'Wallet v1/v2', table: WALLET_V12 }
  return null
}

/**
 * Explains a compute-phase exit code or an action-phase result code. Codes 0-14 come from TVM itself;
 * higher compute codes are defined by the contract, so pass the account's interfaces (from the
 * toncenter address book or tonapi) to get the contract-specific meaning.
 */
export function explainExitCode(code: number, phase: TxPhase, interfaces: string[] = []): ExitInfo {
  if (phase === 'action') {
    const title = ACTION[code]
    return { code, phase, ok: code === 0, title: title ?? `Action phase failed with code ${code}`, source: 'Action phase' }
  }
  if (code in TVM) return { code, phase, ok: code === 0 || code === 1, title: TVM[code]!, source: 'TVM' }
  const c = contractTable(interfaces)
  if (c?.table[code]) return { code, phase, ok: false, title: c.table[code]!, source: c.name }
  if (code === 65535) return { code, phase, ok: false, title: 'Unknown operation: the contract does not handle this message (0xffff)', source: 'Common convention' }
  return {
    code,
    phase,
    ok: false,
    title: 'Error thrown by the contract\'s own code. Its meaning depends on the contract: check its source or docs.',
    source: 'Contract-specific'
  }
}
