import { COIN_FORMER, COIN_SYMBOL } from '~/utils/currency'

// TVM exit codes, action-phase result codes and well-known contract error codes.
// Sources (read 2026-10-23):
//   docs.ton.org/tvm/exit-codes (TVM + action phase + Tolk), docs.tact-lang.org/book/exit-codes (Tact 128-138),
//   contract sources linked in each entry's `url` (wallets, jettons, NFTs).

export type ExitGroup = 'compute' | 'action' | 'compiler' | 'wallet' | 'jetton' | 'nft' | 'convention'

export interface ExitCodeEntry {
  code: number
  /** Inclusive upper bound when one entry covers a range of codes. */
  max?: number
  title: string
  group: ExitGroup
  /** Who throws it: 'TVM', 'Action phase', 'Wallet v4r2', 'Tact', … */
  source: string
  description: string
  /** Practical next step for someone looking at a failed transaction. */
  hint?: string
  url: string
}

export const GROUP_LABELS: Record<ExitGroup, string> = {
  compute: 'Compute phase (TVM)',
  action: 'Action phase',
  compiler: 'Tolk / Tact',
  wallet: 'Wallets',
  jetton: 'Jettons',
  nft: 'NFTs',
  convention: 'Convention'
}

const DOCS = 'https://docs.ton.org/tvm/exit-codes'
const TACT = 'https://docs.tact-lang.org/book/exit-codes/'
const V3 = 'https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc'
const V4 = 'https://github.com/ton-blockchain/wallet-contract/blob/main/func/wallet-v4-code.fc'
const V5 = 'https://github.com/ton-blockchain/wallet-contract-v5/blob/main/contracts/wallet_v5.fc'
const HL3 = 'https://github.com/ton-blockchain/highload-wallet-contract-v3/blob/main/contracts/highload-wallet-v3.func'
const JW_OLD = 'https://github.com/ton-blockchain/token-contract/blob/main/ft/jetton-wallet.fc'
const JM_OLD = 'https://github.com/ton-blockchain/token-contract/blob/main/ft/jetton-minter.fc'
const JETTON = 'https://github.com/ton-blockchain/jetton-contract/blob/main/wrappers/JettonConstants.ts'
const NFT_ITEM = 'https://github.com/ton-blockchain/token-contract/blob/main/nft/nft-item.fc'
const NFT_COLL = 'https://github.com/ton-blockchain/token-contract/blob/main/nft/nft-collection.fc'

const GAS_HINT = `Attach more ${COIN_SYMBOL} to the message (or raise the gas limit in your emulation). Heavy contracts need more gas than a plain transfer.`

export const EXIT_CODES: readonly ExitCodeEntry[] = [
  // Compute phase (TVM)
  { code: 0, title: 'Normal termination', group: 'compute', source: 'TVM', description: 'Standard successful exit code of the compute phase (and result code of a successful action phase).', url: `${DOCS}#0-normal-termination` },
  { code: 1, title: 'Alternative termination', group: 'compute', source: 'TVM', description: 'Alternative successful exit code of the compute phase. Reserved, but does not occur in practice.', url: `${DOCS}#1-alternative-termination` },
  { code: 2, title: 'Stack underflow', group: 'compute', source: 'TVM', description: 'An instruction tried to take more values from the stack than it holds.', hint: 'Usually a bug in hand-written assembly or a getter called with too few arguments.', url: `${DOCS}#2-stack-underflow` },
  { code: 3, title: 'Stack overflow', group: 'compute', source: 'TVM', description: 'Too many values on the stack (more than 255 in a continuation, or deep recursion).', url: `${DOCS}#3-stack-overflow` },
  { code: 4, title: 'Integer overflow', group: 'compute', source: 'TVM', description: 'An integer left the range -2^256 … 2^256-1, or there was a division or modulo by zero.', url: `${DOCS}#4-integer-overflow` },
  { code: 5, title: 'Integer out of expected range', group: 'compute', source: 'TVM', description: 'Range check error: a value does not fit the field it is stored in (e.g. 300 into uint8), or an argument is out of bounds. Also thrown when code tries to throw an exit code outside 0 … 65535.', url: `${DOCS}#5-integer-out-of-expected-range` },
  { code: 6, title: 'Invalid opcode', group: 'compute', source: 'TVM', description: 'The code contains an instruction this TVM version does not know, or sets an unsupported code page.', url: `${DOCS}#6-invalid-opcode` },
  { code: 7, title: 'Type check error', group: 'compute', source: 'TVM', description: 'A primitive received a value of the wrong type (e.g. an integer where a cell was expected), or null where a value was required.', url: `${DOCS}#7-type-check-error` },
  { code: 8, title: 'Cell overflow', group: 'compute', source: 'TVM', description: 'Tried to store more than 1023 bits or more than 4 references in one cell.', url: `${DOCS}#8-cell-overflow` },
  { code: 9, title: 'Cell underflow', group: 'compute', source: 'TVM', description: 'Tried to read more bits or references than a slice contains. Most often the message body or storage layout does not match what the contract expects.', hint: 'Check the message body format (op code, field sizes, missing forward payload bit). A wrongly built jetton transfer body is a common cause.', url: `${DOCS}#9-cell-underflow` },
  { code: 10, title: 'Dictionary error', group: 'compute', source: 'TVM', description: 'A dictionary (hashmap) was read with the wrong layout or key length.', url: `${DOCS}#10-dictionary-error` },
  { code: 11, title: '"Unknown" error', group: 'compute', source: 'TVM', description: 'Described by TVM as "unknown error, may be thrown by user programs". In practice: an ill-formed outgoing message in SENDMSG, or a call to a get-method that does not exist.', hint: 'Calling a getter off-chain? Check the method name: a missing get-method returns 11.', url: `${DOCS}#11-unknown-error` },
  { code: 12, title: 'Fatal error', group: 'compute', source: 'TVM', description: 'Thrown by TVM in situations deemed impossible.', url: `${DOCS}#12-fatal-error` },
  { code: 13, title: 'Out of gas', group: 'compute', source: 'TVM', description: 'Not enough gas to finish the compute phase. Transactions show it as -14 (bitwise NOT of 13).', hint: GAS_HINT, url: `${DOCS}#13-out-of-gas-error` },
  { code: -14, title: 'Out of gas', group: 'compute', source: 'TVM', description: 'Same as 13, shown negated so a contract cannot fake it (contracts can only throw 0 … 65535). The message did not carry enough value to pay for the computation.', hint: GAS_HINT, url: `${DOCS}#-14-out-of-gas-error` },
  { code: 14, title: 'Virtualization error', group: 'compute', source: 'TVM', description: 'Virtualization error related to pruned branch cells. Reserved, never thrown.', url: `${DOCS}#14-virtualization-error` },

  // Action phase result codes
  { code: 32, title: 'Action list is invalid', group: 'action', source: 'Action phase', description: 'The action list contains exotic cells, an action entry cell has no references, or an action cannot be parsed.', url: `${DOCS}#32-action-list-is-invalid` },
  { code: 33, title: 'Action list is too long', group: 'action', source: 'Action phase', description: 'More than 255 actions were queued in one transaction.', url: `${DOCS}#33-action-list-is-too-long` },
  { code: 34, title: 'Invalid or unsupported action', group: 'action', source: 'Action phase', description: 'An action is invalid or not supported (e.g. an ill-formed outgoing message). Only send message, reserve, set code and change library exist.', url: `${DOCS}#34-invalid-or-unsupported-action` },
  { code: 35, title: 'Invalid source address in outbound message', group: 'action', source: 'Action phase', description: 'The source address of an outgoing message is neither addr_none nor the contract\'s own address.', url: `${DOCS}#35-invalid-source-address-in-outbound-message` },
  { code: 36, title: 'Invalid destination address in outbound message', group: 'action', source: 'Action phase', description: 'The destination address is malformed, uses an unknown workchain or has a wrong length. Not thrown if send mode +2 is set (the message is skipped).', url: `${DOCS}#36-invalid-destination-address-in-outbound-message` },
  { code: 37, title: `Not enough ${COIN_SYMBOL}`, group: 'action', source: 'Action phase', description: `Not enough balance to send the message with the requested value and fees (called "Not enough ${COIN_FORMER}" in older docs). Not thrown with send mode +2.`, hint: 'Top up the contract or send less. With mode 64, the incoming value may already be spent on fees.', url: `${DOCS}#37-not-enough-grams` },
  { code: 38, title: 'Not enough extra currencies', group: 'action', source: 'Action phase', description: 'The account lacks the extra-currency amount it tried to send. Not thrown with send mode +2.', url: `${DOCS}#38-not-enough-extra-currencies` },
  { code: 39, title: 'Outbound message does not fit into a cell', group: 'action', source: 'Action phase', description: 'After rewriting, the outgoing message could not be packed into a cell. Not thrown with send mode +2.', url: `${DOCS}#39-outbound-message-does-not-fit-into-cell` },
  { code: 40, title: 'Cannot process message', group: 'action', source: 'Action phase', description: 'Not enough funds to process all cells of the message, or the message is too large or too deep. Not thrown with send mode +2.', url: `${DOCS}#40-cannot-process-message` },
  { code: 41, title: 'Library reference is null', group: 'action', source: 'Action phase', description: 'A library change action needed a library reference, but it was null.', url: `${DOCS}#41-library-reference-is-null` },
  { code: 42, title: 'Library change action error', group: 'action', source: 'Action phase', description: 'A library change action failed.', url: `${DOCS}#42-library-change-action-error` },
  { code: 43, title: 'Library limits exceeded', group: 'action', source: 'Action phase', description: 'Too many cells in the library, or its Merkle depth is too big.', url: `${DOCS}#43-library-limits-exceeded` },
  { code: 46, title: 'Library change action is prohibited', group: 'action', source: 'Action phase', description: 'Tried to add a private library, or a regular account tried to change libraries. Only special masterchain accounts can manage public libraries.', url: `${DOCS}#46-library-change-action-is-prohibited` },
  { code: 50, title: 'Account state size exceeded limits', group: 'action', source: 'Action phase', description: 'At the end of the action phase the account state exceeds the limits from config param 43 (by default 65536 cells / 65536 × 1023 bits).', url: `${DOCS}#50-account-state-size-exceeded-limits` },

  // Compilers
  { code: 63, title: 'Opcode mismatch when unpacking a struct', group: 'compiler', source: 'Tolk', description: 'A Tolk struct was loaded from a cell whose op code (prefix) does not match. Also the default code of throwIfOpcodeDoesNotMatch().', url: `${DOCS}#tolk-compiler` },
  { code: 128, title: 'Null reference exception', group: 'compiler', source: 'Tact', description: 'A null value was force-unwrapped with !! .', url: `${TACT}#128` },
  { code: 129, title: 'Invalid serialization prefix', group: 'compiler', source: 'Tact', description: 'The op code (prefix) of a message or struct does not match when parsing it.', url: `${TACT}#129` },
  { code: 130, title: 'Invalid incoming message', group: 'compiler', source: 'Tact', description: 'No receiver matches the incoming message (unknown op code or text), and there is no fallback receiver.', url: `${TACT}#130` },
  { code: 131, title: 'Constraints error', group: 'compiler', source: 'Tact', description: 'Reserved by Tact for constraint checks. Not thrown in practice.', url: `${TACT}#131` },
  { code: 132, title: 'Access denied', group: 'compiler', source: 'Tact', description: 'Thrown by the Ownable trait (requireOwner) when the sender is not the owner.', url: `${TACT}#132` },
  { code: 133, title: 'Contract stopped', group: 'compiler', source: 'Tact', description: 'Thrown by the Stoppable trait when the contract has been stopped.', url: `${TACT}#133` },
  { code: 134, title: 'Invalid argument', group: 'compiler', source: 'Tact', description: 'A function received an invalid or unexpected argument value.', url: `${TACT}#134` },
  { code: 135, title: 'Code of a contract was not found', group: 'compiler', source: 'Tact', description: 'The code of a contract referenced in initOf could not be found (corrupted or mismatched code dictionary).', url: `${TACT}#135` },
  { code: 136, title: 'Invalid standard address', group: 'compiler', source: 'Tact', description: 'An address is not a valid 267-bit standard address.', url: `${TACT}#136` },
  { code: 137, title: 'Masterchain support is not enabled', group: 'compiler', source: 'Tact', description: 'A masterchain address was used, but the contract was compiled without masterchain support (older Tact versions).', url: `${TACT}#137` },
  { code: 138, title: 'Not a basechain address', group: 'compiler', source: 'Tact', description: 'An address from a workchain other than 0 (basechain) was used where a basechain address is required.', url: `${TACT}#138` },

  // Wallets (thrown in the compute phase, so they overlap with action codes 33-39)
  { code: 33, title: 'Seqno mismatch', group: 'wallet', source: 'Wallet v3 / v4', description: 'The external message carries a seqno different from the one stored in the wallet. The message was already sent or built from stale data.', hint: 'Usually harmless: your wallet app retried an old message. Refresh and send again.', url: V4 },
  { code: 34, title: 'Wrong subwallet id', group: 'wallet', source: 'Wallet v3 / v4', description: 'The subwallet_id in the external message does not match the wallet\'s stored value.', url: V4 },
  { code: 35, title: 'Invalid signature (v4) / invalid signature or expired (v3)', group: 'wallet', source: 'Wallet v3 / v4', description: 'Wallet v4 throws 35 for a bad signature. Wallet v3 throws 35 both for a bad signature and for valid_until in the past.', url: V4 },
  { code: 36, title: 'Message expired', group: 'wallet', source: 'Wallet v4', description: 'valid_until of the external message is in the past.', hint: 'The signed message sat too long before reaching the chain. Sign it again.', url: V4 },
  { code: 39, title: 'Plugin install/remove failed', group: 'wallet', source: 'Wallet v4', description: 'Adding or removing a plugin in the wallet\'s plugin dictionary failed.', url: V4 },
  { code: 80, title: 'Plugin requested more than the balance', group: 'wallet', source: 'Wallet v4', description: 'A plugin (subscription) asked for more funds than the wallet holds.', url: V4 },
  { code: 132, title: 'Signature disabled', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'Signature authentication is turned off while extensions exist, so a signed message is rejected.', url: V5 },
  { code: 133, title: 'Invalid seqno', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The seqno in the signed request does not match the stored seqno.', hint: 'Usually a retried or stale message. Refresh and sign again.', url: V5 },
  { code: 134, title: 'Invalid wallet id', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The wallet_id in the request does not match (e.g. a testnet message sent to a mainnet wallet).', url: V5 },
  { code: 135, title: 'Invalid signature', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The signature does not match the wallet\'s public key.', url: V5 },
  { code: 136, title: 'Expired', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'valid_until of the signed request is in the past.', url: V5 },
  { code: 137, title: 'External send must use ignore-errors mode', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'An external message tried to send an out message without send mode +2 (IGNORE_ERRORS).', url: V5 },
  { code: 138, title: 'Invalid message operation', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The external body does not start with the signed_external prefix 0x7369676e.', url: V5 },
  { code: 139, title: 'Add extension failed', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The extension is already installed.', url: V5 },
  { code: 140, title: 'Remove extension failed', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The extension to remove is not installed.', url: V5 },
  { code: 141, title: 'Unsupported action', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'An extended action type the wallet does not support.', url: V5 },
  { code: 142, title: 'Cannot disable signature without extensions', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'Disabling signature auth requires at least one extension, otherwise the wallet would be locked.', url: V5 },
  { code: 143, title: 'Signature mode already set', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The requested signature mode is already active.', url: V5 },
  { code: 144, title: 'Cannot remove last extension while signature is disabled', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'Removing the last extension would leave no way to control the wallet.', url: V5 },
  { code: 145, title: 'Extension in wrong workchain', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'Extensions must live in the same workchain as the wallet.', url: V5 },
  { code: 146, title: 'Only an extension can change signature mode', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The signature mode can only be changed through an extension action.', url: V5 },
  { code: 147, title: 'Invalid out actions (c5)', group: 'wallet', source: 'Wallet v5r1 (W5)', description: 'The out action list in the request is malformed or longer than 255 actions.', url: V5 },
  { code: 33, title: 'Invalid signature', group: 'wallet', source: 'Highload wallet v3', description: 'The signature does not match the public key.', url: HL3 },
  { code: 34, title: 'Invalid subwallet id', group: 'wallet', source: 'Highload wallet v3', description: 'subwallet_id does not match the stored value.', url: HL3 },
  { code: 35, title: 'Invalid created_at', group: 'wallet', source: 'Highload wallet v3', description: 'created_at is in the future or older than the timeout.', url: HL3 },
  { code: 36, title: 'Already executed', group: 'wallet', source: 'Highload wallet v3', description: 'This query_id was already processed (replay protection).', url: HL3 },
  { code: 37, title: 'Invalid message to send', group: 'wallet', source: 'Highload wallet v3', description: 'The internal message to send is malformed (external info, non-empty source or a state init).', url: HL3 },
  { code: 38, title: 'Invalid timeout', group: 'wallet', source: 'Highload wallet v3', description: 'The timeout in the message does not match the stored timeout.', url: HL3 },

  // Jettons: reference contract (ton-blockchain/token-contract)
  { code: 705, title: 'Not the owner of this jetton wallet', group: 'jetton', source: 'Jetton wallet (token-contract)', description: 'transfer or burn was sent by someone other than the wallet owner.', hint: 'Send jetton transfers to YOUR jetton wallet, from your main wallet.', url: JW_OLD },
  { code: 706, title: 'Insufficient jetton balance', group: 'jetton', source: 'Jetton wallet (token-contract)', description: 'Tried to transfer or burn more jettons than the wallet holds.', url: JW_OLD },
  { code: 707, title: `Invalid sender or not enough ${COIN_SYMBOL} for burn`, group: 'jetton', source: 'Jetton wallet (token-contract)', description: 'internal_transfer did not come from the minter or a valid jetton wallet; for burn, the attached value does not cover fees.', url: JW_OLD },
  { code: 708, title: 'Forward payload missing', group: 'jetton', source: 'Jetton / NFT (token-contract)', description: 'The body ends before the forward_payload Either bit. The transfer body is malformed.', hint: 'Append the forward payload bit (0 for empty inline payload).', url: JW_OLD },
  { code: 709, title: `Not enough ${COIN_SYMBOL} attached for transfer fees`, group: 'jetton', source: 'Jetton wallet (token-contract)', description: 'The message value is below forward_ton_amount + forwarding and gas fees. Also thrown when a bounced message carries an op the wallet cannot refund.', hint: `Attach more ${COIN_SYMBOL} (0.05 is typical) or lower forward_ton_amount.`, url: JW_OLD },
  { code: 73, title: 'Not admin / not owner', group: 'jetton', source: 'Jetton minter (token-contract) / jetton-contract', description: 'An admin-only operation (mint, change admin, change content) came from a non-admin; in jetton-contract wallets, a transfer from a non-owner.', url: JM_OLD },
  { code: 74, title: 'Not a valid jetton wallet', group: 'jetton', source: 'Jetton minter (token-contract) / jetton-contract', description: 'A burn notification or internal transfer came from an address that is not a jetton wallet of this jetton.', url: JETTON },
  { code: 72, title: 'Invalid op', group: 'jetton', source: 'jetton-contract (stablecoin)', description: 'The op code is not valid in this context.', url: JETTON },
  { code: 45, title: 'Contract locked', group: 'jetton', source: 'jetton-contract (stablecoin)', description: 'The jetton wallet is locked by the admin (set_status), so transfers are blocked.', url: JETTON },
  { code: 47, title: 'Balance error', group: 'jetton', source: 'jetton-contract (stablecoin)', description: 'Not enough jettons on the wallet for the transfer or burn.', url: JETTON },
  { code: 48, title: 'Not enough gas', group: 'jetton', source: 'jetton-contract (stablecoin)', description: `The attached ${COIN_SYMBOL} does not cover the forward amount and fees.`, hint: `Attach more ${COIN_SYMBOL} to the transfer.`, url: JETTON },
  { code: 49, title: 'Invalid message', group: 'jetton', source: 'jetton-contract (stablecoin)', description: 'The message body is malformed.', url: JETTON },
  { code: 75, title: 'Discovery fee not matched', group: 'jetton', source: 'jetton-contract (stablecoin)', description: `provide_wallet_address was sent with too little ${COIN_SYMBOL} to pay for the reply.`, url: JETTON },
  { code: 333, title: 'Wrong workchain', group: 'jetton', source: 'Jetton / NFT (token-contract) / jetton-contract', description: 'The destination or owner address is not in the basechain (workchain 0).', url: JETTON },

  // NFTs: reference contract (ton-blockchain/token-contract)
  { code: 401, title: 'Not the owner', group: 'nft', source: 'NFT item / collection (token-contract)', description: 'NFT transfer sent by someone other than the owner; or a collection admin operation from a non-owner.', url: NFT_ITEM },
  { code: 402, title: `Not enough ${COIN_SYMBOL} / invalid index`, group: 'nft', source: 'NFT item / collection (token-contract)', description: 'Item: the attached value does not cover forward_amount and fees. Collection: deploying an item with index greater than next_item_index.', url: NFT_ITEM },
  { code: 405, title: 'Init not from collection', group: 'nft', source: 'NFT item (token-contract)', description: 'An uninitialized item received its init message from an address other than its collection.', url: NFT_ITEM },
  { code: 399, title: 'Batch deploy too large', group: 'nft', source: 'NFT collection (token-contract)', description: 'Batch deploy with 250 or more items (action list limit).', url: NFT_COLL },
  { code: 404, max: 652, title: 'Batch deploy: item index too high', group: 'nft', source: 'NFT collection (token-contract)', description: 'Batch deploy throws 403 + n when the n-th item\'s index is greater than next_item_index.', url: NFT_COLL },

  // Conventions
  { code: 0xffff, title: 'Unknown op code', group: 'convention', source: 'Most contracts', description: 'By convention, contracts throw 65535 (0xffff) when the incoming op code has no handler. Set by contract code, not by TVM.', hint: 'You sent a message type this contract does not understand. Check the op code and the destination address.', url: DOCS }
]

/** Parses "13", "-14", "0xffff". Returns null for anything else. */
export function parseExitCode(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (/^-?\d{1,10}$/.test(s)) return Number(s)
  if (/^0x[0-9a-f]{1,8}$/.test(s)) return Number.parseInt(s.slice(2), 16)
  return null
}

export function lookupExitCode(code: number): ExitCodeEntry[] {
  return EXIT_CODES.filter(e => e.max === undefined ? e.code === code : code >= e.code && code <= e.max)
}

/** Explains which range a code belongs to (useful when it is not in the table). */
export function codeRange(code: number): string {
  if (code === -14) return 'Out of gas, negated so contracts cannot fake it.'
  if (code < 0 || code > 0xffff) return 'Contracts can only throw 0 … 65535. Throwing anything else fails with exit code 5, so this value did not come from a throw.'
  if (code <= 127) return '0 … 127 is reserved for TVM and the blockchain (compute and action phases). Tolk also uses this range.'
  if (code <= 255) return '128 … 255 is used by the Tact compiler. Other contracts may reuse it for their own errors (wallet v5 uses 132 … 147).'
  return '256 … 65535 is free for developer-defined errors. Its meaning depends on the contract: look for throw / assert with this number in its source.'
}

/** Text or number search; optional group filter. Empty query returns everything in the group. */
export function searchExitCodes(query: string, group?: ExitGroup): ExitCodeEntry[] {
  const pool = group ? EXIT_CODES.filter(e => e.group === group) : EXIT_CODES
  const q = query.trim().toLowerCase()
  if (!q) return [...pool]
  const n = parseExitCode(q)
  if (n !== null) return pool.filter(e => lookupExitCode(n).includes(e))
  const words = q.split(/\s+/)
  return pool.filter((e) => {
    const hay = `${e.title} ${e.source} ${e.description} ${e.hint ?? ''} ${GROUP_LABELS[e.group]}`.toLowerCase()
    return words.every(w => hay.includes(w))
  })
}
