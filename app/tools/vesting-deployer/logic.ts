// Vesting wallet deploy (ton-blockchain/vesting-contract, the contract vesting.ton.org creates).
// Data (wrappers/VestingWallet.ts vestingWalletConfigToCell): seqno:uint32=0 subwallet_id:uint32 public_key:uint256
// whitelist:(HashmapE 264 int1)=empty ^[start:uint64 total_duration:uint32 unlock_period:uint32 cliff:uint32
// total_amount:Coins sender:MsgAddress owner:MsgAddress]. vesting.ton.org (TonWeb VestingWalletV1) uses
// subwallet_id = 268 + workchain, deploys with 0.5 GRAM and puts add_whitelist (op 0x7258a69b) in the deploy body.
import type { Cell, StateInit } from '@ton/core'
import { Address, beginCell, contractAddress, storeStateInit } from '@ton/core'
import { codes, splitLines } from '~/lib/deployers/codes'
import { formatCoin } from '~/utils/currency'

export const OP_ADD_WHITELIST = 0x7258a69b
export const WALLET_ID_BASE = 268
/** What vesting.ton.org attaches to the deploy message. */
export const DEPLOY_VALUE = 500_000_000n
/** vesting.ton.org minimum total amount. */
export const MIN_TOTAL = 1_000_000_000n
export const DAY = 86400

export interface VestingConfig {
  workchain: 0 | -1
  publicKey: Buffer
  startTime: number
  totalDuration: number
  unlockPeriod: number
  cliffDuration: number
  totalAmount: bigint
  sender: Address
  owner: Address
}

export function vestingData(c: VestingConfig): Cell {
  return beginCell()
    .storeUint(0, 32)
    .storeUint(WALLET_ID_BASE + c.workchain, 32)
    .storeBuffer(c.publicKey, 32)
    .storeBit(false)
    .storeRef(beginCell()
      .storeUint(c.startTime, 64)
      .storeUint(c.totalDuration, 32)
      .storeUint(c.unlockPeriod, 32)
      .storeUint(c.cliffDuration, 32)
      .storeCoins(c.totalAmount)
      .storeAddress(c.sender)
      .storeAddress(c.owner))
    .endCell()
}

/** add_whitelist#7258a69b query_id:uint64 addr:MsgAddress, then each further address in a ref chain (TonWeb createAddWhitelistBody). */
export function addWhitelistBody(addresses: Address[], queryId = 0n): Cell {
  if (!addresses.length) throw new Error('No whitelist addresses')
  let tail: Cell | null = null
  for (let i = addresses.length - 1; i >= 1; i--) {
    const b = beginCell().storeAddress(addresses[i]!)
    if (tail) b.storeRef(tail)
    tail = b.endCell()
  }
  const root = beginCell().storeUint(OP_ADD_WHITELIST, 32).storeUint(queryId, 64).storeAddress(addresses[0]!)
  if (tail) root.storeRef(tail)
  return root.endCell()
}

export interface VestingPlan { init: StateInit, stateInit: Cell, address: Address }

export function planVesting(c: VestingConfig): VestingPlan {
  const init = { code: codes().vesting, data: vestingData(c) }
  return { init, stateInit: beginCell().store(storeStateInit(init)).endCell(), address: contractAddress(c.workchain, init) }
}

export interface VestingMessage { address: string, amount: bigint, payload?: Cell, stateInit?: Cell }

/**
 * 1: deploy (0.5 GRAM, + add_whitelist body if any; the contract then returns the unused value to you).
 * 2 (optional): the vested amount itself, a plain transfer. A separate message because add_whitelist sends the
 * whole incoming value back (mode 64). Same sender and receiver, so it arrives after the deploy.
 */
export function vestingMessages(plan: VestingPlan, whitelist: Address[], fund: bigint | null, testnet: boolean): VestingMessage[] {
  const to = plan.address.toString({ bounceable: true, testOnly: testnet })
  const out: VestingMessage[] = [{ address: to, amount: DEPLOY_VALUE, stateInit: plan.stateInit, ...(whitelist.length ? { payload: addWhitelistBody(whitelist) } : {}) }]
  if (fund) out.push({ address: to, amount: fund })
  return out
}

// ---------------------------------------------------------------- form

export interface VestingForm {
  owner: string
  /** Hex public key of the owner's wallet (64 hex chars). */
  publicKey: string
  /** Unix seconds. */
  startTime: number | null
  total: bigint | null
  durationDays: string
  cliffDays: string
  unlockDays: string
  whitelist: string
  masterchain: boolean
}

export type VestingErrors = Partial<Record<'owner' | 'publicKey' | 'startTime' | 'total' | 'durationDays' | 'cliffDays' | 'unlockDays' | 'whitelist', string>>

function days(v: string, what: string, allowZero: boolean): number | string {
  const t = v.trim()
  if (!t) return `Enter the ${what} in days${allowZero ? ' (0 for none)' : ''}.`
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return `The ${what} must be ${allowZero ? '0 or more' : 'more than 0'} days.`
  return Math.round(n * DAY)
}

/** The contract's CONDITIONS block and vesting.ton.org's form checks. */
export function validateVesting(f: VestingForm, sender: Address): { errors: VestingErrors, config?: VestingConfig, whitelist: Address[] } {
  const errors: VestingErrors = {}
  let owner: Address | null = null
  try {
    owner = Address.parse(f.owner.trim())
  }
  catch {
    errors.owner = f.owner.trim() ? 'Not a valid TON address.' : 'Enter the recipient\'s wallet address.'
  }
  const pk = f.publicKey.trim().toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(pk)) errors.publicKey = 'A public key is 64 hex characters.'
  if (f.startTime === null || !Number.isInteger(f.startTime) || f.startTime < 0) errors.startTime = 'Pick the vesting start date.'
  if (f.total === null) errors.total = 'Enter the total amount to vest.'
  else if (f.total < MIN_TOTAL) errors.total = `At least ${formatCoin(MIN_TOTAL)}.`
  const total = days(f.durationDays, 'total duration', false)
  const cliff = days(f.cliffDays, 'cliff', true)
  const unlock = days(f.unlockDays, 'unlock period', false)
  if (typeof total === 'string') errors.durationDays = total
  else if (total > 2 ** 32 - 1) errors.durationDays = 'At most about 135 years (2^32 seconds).'
  if (typeof cliff === 'string') errors.cliffDays = cliff
  if (typeof unlock === 'string') errors.unlockDays = unlock
  if (typeof total === 'number' && typeof cliff === 'number' && !errors.durationDays && cliff >= total) errors.cliffDays = 'The cliff must be shorter than the total duration.'
  if (typeof total === 'number' && typeof unlock === 'number' && !errors.durationDays && !errors.unlockDays) {
    if (unlock > total) errors.unlockDays = 'Cannot be longer than the total duration.'
    else if (total % unlock) errors.durationDays = 'The total duration must be a whole number of unlock periods.'
  }
  if (typeof cliff === 'number' && typeof unlock === 'number' && !errors.cliffDays && !errors.unlockDays && cliff % unlock) errors.cliffDays = 'The cliff must be a whole number of unlock periods (or 0).'

  const whitelist: Address[] = []
  for (const [i, s] of splitLines(f.whitelist).entries()) {
    try {
      whitelist.push(Address.parse(s))
    }
    catch {
      errors.whitelist = `Line ${i + 1} is not a valid TON address.`
      break
    }
  }
  if (Object.keys(errors).length) return { errors, whitelist }
  return {
    errors,
    whitelist,
    config: {
      workchain: f.masterchain ? -1 : 0,
      publicKey: Buffer.from(pk, 'hex'),
      startTime: f.startTime!,
      totalDuration: total as number,
      unlockPeriod: unlock as number,
      cliffDuration: cliff as number,
      totalAmount: f.total!,
      sender,
      owner: owner!
    }
  }
}

/** tonapi /v2/accounts/{id}/publickey returns { public_key: hex }. */
export function normalizePublicKey(r: { public_key?: string }): string {
  const k = (r.public_key ?? '').toLowerCase()
  if (!/^[0-9a-f]{1,64}$/.test(k)) throw new Error('No public key returned')
  return k.padStart(64, '0')
}
