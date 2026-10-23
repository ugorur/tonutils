// Single nominator pool (ton-blockchain/single-nominator) owner operations. Imports @ton/core: Tool.vue / tests only.
import type { Address } from '@ton/core'
import { beginCell, Cell } from '@ton/core'
import type { TonapiMethodResult } from '~/lib/staking/pools'

// contracts/single-nominator.fc
export const OP_WITHDRAW = 0x1000
export const OP_CHANGE_VALIDATOR = 0x1001
/** MIN_TON_FOR_STORAGE: the contract always keeps 1 GRAM. */
export const STORAGE_RESERVE = 1_000_000_000n
/** Attached to owner messages (the repo's deeplink script uses 1 TON). Withdraw returns it with the payout (mode 64). */
export const ACTION_VALUE = 1_000_000_000n

export const ELECTOR = '-1:3333333333333333333333333333333333333333333333333333333333333333'

/** withdraw#1000 query_id:uint64 amount:Coins. The contract sends min(amount, balance - 1 GRAM) to the owner. */
export function withdrawBody(amount: bigint, queryId = 0n): Cell {
  return beginCell().storeUint(OP_WITHDRAW, 32).storeUint(queryId, 64).storeCoins(amount).endCell()
}

/** change_validator#1001 query_id:uint64 new_validator:MsgAddress. */
export function changeValidatorBody(validator: Address, queryId = 1n): Cell {
  return beginCell().storeUint(OP_CHANGE_VALIDATOR, 32).storeUint(queryId, 64).storeAddress(validator).endCell()
}

/** get_roles() -> (owner, validator) as cells holding a MsgAddress (tonapi returns hex BOCs). */
export function parseRoles(r: TonapiMethodResult): { owner: Address, validator: Address } {
  if (r.exit_code !== 0) throw new Error(`get_roles failed with exit code ${r.exit_code}: this is not a single nominator pool.`)
  const addr = (i: number) => {
    const hex = r.stack[i]?.cell ?? r.stack[i]?.slice
    if (!hex) throw new Error('get_roles returned an unexpected stack.')
    return Cell.fromBoc(Buffer.from(hex, 'hex'))[0]!.beginParse().loadAddress()
  }
  return { owner: addr(0), validator: addr(1) }
}

/** What withdraw can pay out right now: everything above the 1 GRAM storage reserve. Stake at the elector is not withdrawable. */
export function withdrawable(balance: bigint): bigint {
  return balance > STORAGE_RESERVE ? balance - STORAGE_RESERVE : 0n
}

/** tonapi /v2/blockchain/validators entry for this pool, if it is in the current validator set. */
export function validatorStake(list: { address: string, stake: number }[], raw: string): bigint | null {
  const v = list.find(x => x.address.toLowerCase() === raw.toLowerCase())
  // ponytail: JSON number, exact below 2^53 nano (~9M GRAM): enough for one validator stake.
  return v ? BigInt(Math.round(v.stake)) : null
}
