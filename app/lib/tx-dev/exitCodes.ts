// Exit codes for the compute phase and result codes for the action phase.
// Sources: Tact docs "Exit codes" table (tact-lang/tact docs/book/exit-codes.mdx, which mirrors the TVM
// whitepaper and the TON node), wallet sources: ton-blockchain/ton crypto/smartcont/wallet3-code.fc,
// ton-blockchain/wallet-contract func/wallet-v4-code.fc, ton-blockchain/wallet-contract-v5 contracts/wallet_v5.fc.

import { COIN_SYMBOL } from '~/utils/currency'

const COMPUTE: Record<number, string> = {
  0: 'Success',
  1: 'Success (alternative exit code)',
  2: 'Stack underflow: an instruction needed more values than were on the stack',
  3: 'Stack overflow',
  4: 'Integer overflow (or division by zero)',
  5: 'Range check error: an integer is out of its expected range',
  6: 'Invalid TVM opcode',
  7: 'Type check error: an argument has the wrong type',
  8: 'Cell overflow: wrote more than 1023 bits or 4 references into a cell',
  9: 'Cell underflow: read more bits or references than the slice has (often a malformed message body, or a missing library cell)',
  10: 'Dictionary error',
  11: 'Unknown error, may be thrown by user programs',
  12: 'Fatal error',
  13: 'Out of gas',
  [-14]: 'Out of gas (cannot be faked by the contract)',
  14: 'VM virtualization error',
  128: 'Tact: null reference exception',
  129: 'Tact: invalid serialization prefix',
  130: 'Tact: no receiver for this opcode (invalid incoming message)',
  132: 'Tact: access denied (sender is not the owner)',
  133: 'Tact: contract stopped',
  134: 'Tact: invalid argument',
  135: 'Tact: contract code not found',
  136: 'Tact: invalid standard address',
  138: 'Tact: not a basechain address',
  65535: 'Unknown opcode (common convention: the contract does not handle this message)'
}

const ACTION: Record<number, string> = {
  0: 'Success',
  32: 'Action list is invalid',
  33: 'Action list is too long (more than 255 actions)',
  34: 'Action is invalid or not supported (often a bad send mode)',
  35: 'Invalid source address in an outbound message',
  36: 'Invalid destination address in an outbound message',
  37: `Not enough ${COIN_SYMBOL} to send the message and pay its fees`,
  38: 'Not enough extra currencies',
  39: 'Outbound message does not fit into a cell after rewriting',
  40: 'Cannot process a message: not enough funds, the message is too large, or its Merkle depth is too big',
  41: 'Library reference is null during a library change action',
  42: 'Library change action error',
  43: 'Library exceeds the maximum number of cells or Merkle depth',
  50: 'Account state size exceeded limits'
}

/** Wallet-specific compute exit codes, keyed by WalletVersion from ~/utils/ton/wallets. */
const WALLET: Record<string, Record<number, string>> = {
  v3: {
    33: 'Wallet: wrong seqno (this message was already used, or another one went first)',
    34: 'Wallet: wrong subwallet id',
    35: 'Wallet: invalid signature, or the message expired (valid_until is in the past)'
  },
  v4: {
    33: 'Wallet: wrong seqno (this message was already used, or another one went first)',
    34: 'Wallet: wrong subwallet id',
    35: 'Wallet: invalid signature',
    36: 'Wallet: message expired (valid_until is in the past)',
    39: 'Wallet: plugin dictionary update failed',
    80: 'Wallet: not enough balance for the plugin request'
  },
  v5: {
    132: 'W5: signature authentication is disabled for this wallet',
    133: 'W5: wrong seqno (this message was already used, or another one went first)',
    134: 'W5: wrong wallet id (message signed for another network or subwallet)',
    135: 'W5: invalid signature',
    136: 'W5: message expired (valid_until is in the past)',
    137: 'W5: external messages must use send mode +2 (ignore errors)',
    138: 'W5: invalid message operation',
    139: 'W5: could not add the extension',
    140: 'W5: could not remove the extension',
    141: 'W5: unsupported action',
    142: 'W5: cannot disable signature with no extensions installed',
    143: 'W5: this signature mode is already set',
    144: 'W5: cannot remove the last extension while signature is disabled',
    145: 'W5: extension must be in the same workchain',
    146: 'W5: only an extension can change the signature mode',
    147: 'W5: invalid action list (c5)'
  }
}

function walletFamily(version?: string | null): string | null {
  if (!version) return null
  if (version.startsWith('v3')) return 'v3'
  if (version.startsWith('v4')) return 'v4'
  if (version === 'v5r1') return 'v5'
  return null
}

/** Human description of a compute-phase exit code. `walletVersion` (e.g. 'v4r2') adds wallet-specific meanings. */
export function describeExitCode(code: number, walletVersion?: string | null): string {
  const fam = walletFamily(walletVersion)
  const w = fam ? WALLET[fam]?.[code] : undefined
  if (w) return w
  // TVM itself only throws 0-14 (and -14); anything else not listed comes from a THROW in the contract code.
  return COMPUTE[code] ?? (code > 14 ? 'Custom error thrown by the contract (its meaning is in the contract source)' : 'Unknown exit code')
}

/** Human description of an action-phase result code. */
export function describeResultCode(code: number): string {
  return ACTION[code] ?? 'Unknown result code'
}

/** Compute exit codes that mean success. */
export const isSuccessExit = (code: number) => code === 0 || code === 1
