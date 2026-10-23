// Send mode (SENDRAWMSG) and reserve mode (RAWRESERVE) composition, validation and a reserve simulator.
// Rules follow the node implementation: ton-blockchain/ton crypto/block/transaction.cpp
// (try_action_send_message, try_action_reserve_currency). Pure TS, no @ton/*.
import { COIN_SYMBOL } from '~/utils/currency'

export interface ModeBit {
  value: number
  /** Tolk stdlib constant name. */
  tolk: string
  /** @ton/core SendMode member, when it has one. */
  tonCore?: string
  title: string
  effect: string
}

export const SEND_BASES: ModeBit[] = [
  { value: 0, tolk: 'SEND_MODE_REGULAR', tonCore: 'NONE', title: 'Ordinary message', effect: 'Sends exactly the value you put in the message. Forward and action fees are deducted from that value unless +1 is set.' },
  { value: 64, tolk: 'SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE', tonCore: 'CARRY_ALL_REMAINING_INCOMING_VALUE', title: 'Carry remaining inbound value', effect: 'Adds whatever is left of the incoming message value to the amount in the message. Without +1, the compute-phase gas is subtracted from it. Typical for replies and excess refunds.' },
  { value: 128, tolk: 'SEND_MODE_CARRY_ALL_BALANCE', tonCore: 'CARRY_ALL_REMAINING_BALANCE', title: 'Carry the whole balance', effect: 'Sends the entire remaining balance of the contract (after earlier actions and reserves) instead of the value in the message. Fees always come out of that amount.' }
]

export const SEND_FLAGS: ModeBit[] = [
  { value: 1, tolk: 'SEND_MODE_PAY_FEES_SEPARATELY', tonCore: 'PAY_GAS_SEPARATELY', title: 'Pay fees separately', effect: 'Forward and action fees are paid from the contract balance, so the recipient gets the full value.' },
  { value: 2, tolk: 'SEND_MODE_IGNORE_ERRORS', tonCore: 'IGNORE_ERRORS', title: 'Ignore errors', effect: 'If this message cannot be sent in the action phase (not enough funds, too large, bad extra currency), it is skipped instead of failing the whole transaction.' },
  { value: 16, tolk: 'SEND_MODE_BOUNCE_ON_ACTION_FAIL', title: 'Bounce on action fail', effect: 'If the action phase fails, the inbound message is bounced back to its sender.' },
  { value: 32, tolk: 'SEND_MODE_DESTROY', tonCore: 'DESTROY_ACCOUNT_IF_ZERO', title: 'Destroy if balance is zero', effect: 'Deletes the account when its balance reaches zero after this message. Only works together with 128.' }
]

export const RESERVE_BITS: ModeBit[] = [
  { value: 1, tolk: 'RESERVE_MODE_ALL_BUT_AMOUNT', title: 'All but amount', effect: 'Reserve everything except the amount: the amount is what stays spendable.' },
  { value: 2, tolk: 'RESERVE_MODE_AT_MOST', title: 'At most', effect: 'Reserve min(amount, remaining balance) instead of failing when the balance is lower.' },
  { value: 4, tolk: 'RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE', title: 'Add original balance', effect: 'Add the balance the account had before this transaction\'s compute phase to the amount.' },
  { value: 8, tolk: 'RESERVE_MODE_NEGATE_AMOUNT', title: 'Negate amount', effect: 'Use original balance − amount. Only valid together with +4.' },
  { value: 16, tolk: 'RESERVE_MODE_BOUNCE_ON_ACTION_FAIL', title: 'Bounce on action fail', effect: 'If this reserve action fails, the inbound message is bounced.' }
]

export type Severity = 'error' | 'warning' | 'info'
export interface Note { severity: Severity, text: string }

export interface SendModeInfo {
  mode: number
  base: 0 | 64 | 128 | null
  flags: number[]
  notes: Note[]
  valid: boolean
}

/** Parses "3", "0x83", "128 + 32", "128|32". Throws on anything else. */
export function parseMode(input: string): number {
  const s = input.trim()
  if (!s) throw new Error('Enter a mode number')
  const or = s.includes('|')
  let n = 0
  for (const p of s.split(/\s*[+|]\s*/)) {
    if (!/^(0x[0-9a-f]+|\d+)$/i.test(p)) throw new Error(`"${p}" is not a number. Use decimal, 0x… hex, or a sum like 128 + 32.`)
    const v = Number(p)
    if (!Number.isSafeInteger(v)) throw new Error('Number too large')
    n = or ? n | v : n + v
  }
  return n
}

/** Decodes a SENDRAWMSG mode and explains what the node will do with it. */
export function explainSendMode(mode: number, ctx: { external?: boolean } = {}): SendModeInfo {
  const notes: Note[] = []
  if (!Number.isInteger(mode) || mode < 0 || mode > 255) {
    return { mode, base: null, flags: [], valid: false, notes: [{ severity: 'error', text: 'SENDRAWMSG takes a mode from 0 to 255.' }] }
  }
  const flags = SEND_FLAGS.map(f => f.value).filter(v => mode & v)
  const has = (v: number) => (mode & v) === v
  let valid = true
  const stray = mode & ~0xf3 // 0xe3 allowed after +16 is stripped
  if (stray) {
    valid = false
    notes.push({ severity: 'error', text: `Bit${stray & (stray - 1) ? 's' : ''} ${[4, 8].filter(b => stray & b).join(' and ')} ${stray & (stray - 1) ? 'are' : 'is'} not a send-mode flag: the action fails with result code 34 (invalid action)${has(2) ? ', or is skipped because of +2' : ''}.` })
  }
  let base: SendModeInfo['base'] = 0
  if (has(64) && has(128)) {
    valid = false
    base = null
    notes.push({ severity: 'error', text: '64 and 128 cannot be combined: the node rejects the action as invalid.' })
  }
  else base = has(128) ? 128 : has(64) ? 64 : 0

  if (ctx.external && mode & ~3) {
    valid = false
    notes.push({ severity: 'error', text: 'An outbound external message (log/event) accepts only modes 0 to 3.' })
  }
  if (has(128) && has(1)) notes.push({ severity: 'info', text: '+1 is ignored with 128: fees are always taken from the carried balance.' })
  if (has(32) && !has(128)) notes.push({ severity: 'warning', text: '+32 does nothing without 128: the account is destroyed only when a 128 message empties it.' })
  if (has(32) && has(128)) notes.push({ severity: 'warning', text: 'The account is deleted if its balance ends at zero and nothing is reserved. Its code and data are gone; a later message can only redeploy it from StateInit.' })
  if (has(16) && has(2)) notes.push({ severity: 'info', text: '+16 has no effect with +2: a failing message is skipped, so the action phase does not fail.' })
  if (!has(2) && valid) notes.push({ severity: 'warning', text: 'Without +2, a message that cannot be sent fails the whole action phase and cancels every other action in the transaction. Wallet transfers should always add +2.' })
  if (has(64)) notes.push({ severity: 'info', text: `Since global version 10, 64 carries only the remaining ${COIN_SYMBOL} of the inbound message: its extra currencies stay on the account unless listed in the message.` })
  if (has(64) && !has(1)) notes.push({ severity: 'info', text: 'With 64 and no +1, the compute-phase gas fee is subtracted from the carried value.' })
  if (has(128)) notes.push({ severity: 'info', text: `Since global version 10 (the extra currency update), 128 carries only ${COIN_SYMBOL}: extra currencies stay on the account unless listed in the message.` })
  if (mode === 3) notes.push({ severity: 'info', text: 'Mode 3 is the standard wallet mode: the recipient gets the exact amount and a failing message does not break the transaction.' })
  return { mode, base, flags, notes, valid }
}

export function composeMode(base: number, flags: number[]): number {
  return flags.reduce((m, f) => m | f, base)
}

export interface ReserveModeInfo { mode: number, bits: number[], notes: Note[], valid: boolean }

export function explainReserveMode(mode: number): ReserveModeInfo {
  const notes: Note[] = []
  if (!Number.isInteger(mode) || mode < 0) return { mode, bits: [], valid: false, notes: [{ severity: 'error', text: 'Enter a non-negative integer.' }] }
  const bits = RESERVE_BITS.map(b => b.value).filter(v => mode & v)
  let valid = true
  if (mode & ~31) {
    valid = false
    notes.push({ severity: 'error', text: 'Only bits 1, 2, 4, 8 and 16 exist: RAWRESERVE fails with result code 34.' })
  }
  if (mode & 8 && !(mode & 4)) {
    valid = false
    notes.push({ severity: 'error', text: '+8 (negate) without +4 is rejected as an invalid reserve mode.' })
  }
  const core = mode & 15
  const what: Record<number, string> = {
    0: 'Reserve exactly amount. Fails if the balance is lower.',
    1: 'Reserve everything except amount: only amount stays spendable.',
    2: 'Reserve up to amount (all of it if the balance is lower). Never fails for lack of funds.',
    3: 'Keep at most amount spendable, reserve the rest. Never fails for lack of funds.',
    4: 'Reserve original balance + amount: keeps everything the account had before this transaction, plus amount.',
    5: 'Leave original balance + amount spendable, reserve the rest.',
    6: 'Reserve min(original balance + amount, remaining balance).',
    7: 'Leave min(original balance + amount, remaining) spendable, reserve the rest.',
    12: 'Reserve original balance − amount: lets the contract spend up to amount of its old balance.',
    13: 'Leave original balance − amount spendable, reserve the rest.',
    14: 'Reserve min(original balance − amount, remaining balance). Common to keep the pre-transaction balance minus a known fee.',
    15: 'Leave min(original balance − amount, remaining) spendable, reserve the rest.'
  }
  if (valid && what[core]) notes.unshift({ severity: 'info', text: what[core]! })
  if (mode & 16) notes.push({ severity: 'info', text: 'If this reserve fails, the inbound message bounces (+16).' })
  return { mode, bits, notes, valid }
}

export interface ReserveResult {
  ok: boolean
  /** Result code when the action fails (37 = not enough GRAM, 34 = invalid action). */
  exitCode?: number
  error?: string
  /** Amount moved into the reserve. */
  reserved?: bigint
  /** Balance left for later actions (what a 128 message would carry). */
  remaining?: bigint
}

/**
 * Simulates RAWRESERVE on GRAM only, line for line with try_action_reserve_currency.
 * originalBalance: balance before the compute phase; remaining: balance left for the action phase at this point.
 */
export function simulateReserve(p: { mode: number, amount: bigint, originalBalance: bigint, remaining: bigint }): ReserveResult {
  let mode = p.mode
  if (mode & 16) mode &= ~16
  if (mode & ~15) return { ok: false, exitCode: 34, error: 'Invalid reserve mode.' }
  if (p.amount < 0n) return { ok: false, exitCode: 34, error: 'Amount must be non-negative.' }
  let reserve = p.amount
  if (mode & 4) reserve = mode & 8 ? p.originalBalance - reserve : p.originalBalance + reserve
  else if (mode & 8) return { ok: false, exitCode: 34, error: '+8 without +4 is invalid.' }
  if (reserve < 0n) return { ok: false, exitCode: 34, error: 'The reserve would be negative (amount is larger than the original balance).' }
  if (mode & 2 && reserve > p.remaining) reserve = p.remaining
  if (reserve > p.remaining) return { ok: false, exitCode: 37, error: `Not enough ${COIN_SYMBOL} on the balance to reserve this amount.` }
  let remaining = p.remaining - reserve
  if (mode & 1) [remaining, reserve] = [reserve, remaining]
  return { ok: true, reserved: reserve, remaining }
}

export interface Preset { mode: number, label: string, use: string }

export const SEND_PRESETS: Preset[] = [
  { mode: 3, label: '3 = 0 + 1 + 2', use: 'Standard wallet transfer: exact value to the recipient, skip on error.' },
  { mode: 0, label: '0', use: 'Plain message, fees taken from the value. Fails the transaction on error.' },
  { mode: 1, label: '1', use: 'Exact value, fees from balance. Unsafe in wallets without +2.' },
  { mode: 64, label: '64', use: 'Forward what is left of the incoming value: replies, excess refunds, jetton internal transfers.' },
  { mode: 66, label: '66 = 64 + 2', use: 'Same as 64, but skip the message instead of failing.' },
  { mode: 128, label: '128', use: 'Send the whole balance (after reserves). Withdrawals, "send max".' },
  { mode: 130, label: '130 = 128 + 2', use: 'Send the whole balance, skip on error. W5 and v4 "send all" use this.' },
  { mode: 160, label: '160 = 128 + 32', use: 'Send everything and delete the account. Used when closing a contract.' }
]

export const RESERVE_PRESETS: Preset[] = [
  { mode: 0, label: '0', use: 'Keep exactly amount on the contract (e.g. a minimum storage balance).' },
  { mode: 2, label: '2', use: 'Keep up to amount, never fail.' },
  { mode: 4, label: '4', use: 'Keep the pre-transaction balance (+ amount), then send the rest with mode 128.' },
  { mode: 12, label: '12 = 4 + 8', use: 'Keep the old balance minus amount (let the contract spend amount of it).' },
  { mode: 14, label: '14 = 4 + 8 + 2', use: 'Same as 12, but never fail.' }
]
