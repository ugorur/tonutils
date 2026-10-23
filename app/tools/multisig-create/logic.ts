// Multisig v2 deploy (ton-blockchain/multisig-contract-v2). Data layout from wrappers/Multisig.ts multisigConfigToCell:
// next_order_seqno:uint256 threshold:uint8 signers:^(Hashmap 8 MsgAddressInt) signers_num:uint8
// proposers:(HashmapE 8 MsgAddressInt) allow_arbitrary_order_seqno:Bool.
// The message is the one multisig.ton.org sends: StateInit, no body, bounceable, allow_arbitrary_order_seqno = true.
import type { Cell, StateInit } from '@ton/core'
import { Address, beginCell, contractAddress, Dictionary, storeStateInit } from '@ton/core'
import { codes, splitLines } from '~/lib/deployers/codes'

export interface MultisigConfig {
  threshold: number
  signers: Address[]
  proposers: Address[]
  allowArbitrarySeqno: boolean
}

/** signers_num and signer indexes are uint8. */
export const MAX_SIGNERS = 255

function addressDict(list: Address[]) {
  const d = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Address())
  list.forEach((a, i) => d.set(i, a))
  return d
}

export function multisigData(c: MultisigConfig): Cell {
  return beginCell()
    .storeUint(0, 256)
    .storeUint(c.threshold, 8)
    .storeRef(beginCell().storeDictDirect(addressDict(c.signers)))
    .storeUint(c.signers.length, 8)
    .storeDict(addressDict(c.proposers))
    .storeBit(c.allowArbitrarySeqno)
    .endCell()
}

export interface MultisigPlan {
  init: StateInit
  stateInit: Cell
  address: Address
}

export function planMultisig(c: MultisigConfig): MultisigPlan {
  const init = { code: codes().multisig, data: multisigData(c) }
  return { init, stateInit: beginCell().store(storeStateInit(init)).endCell(), address: contractAddress(0, init) }
}

export interface MultisigForm {
  signers: string
  proposers: string
  threshold: string
}

export interface MultisigErrors { signers?: string, proposers?: string, threshold?: string }

function parseList(text: string, what: string, seen: Map<string, string>): { list: Address[], error?: string } {
  const list: Address[] = []
  for (const [i, s] of splitLines(text).entries()) {
    let a: Address
    try {
      a = Address.parse(s)
    }
    catch {
      return { list, error: `${what} ${i + 1} is not a valid TON address: ${s.length > 20 ? `${s.slice(0, 20)}…` : s}` }
    }
    const raw = a.toRawString()
    const dup = seen.get(raw)
    if (dup) return { list, error: `${what} ${i + 1} is already listed as ${dup}. Each address can appear only once.` }
    seen.set(raw, `${what.toLowerCase()} ${i + 1}`)
    list.push(a)
  }
  return { list }
}

/** Same rules as the contract (1..255 signers, 1 <= threshold <= signers) and multisig.ton.org (no duplicates across both lists). */
export function validateMultisig(f: MultisigForm): { errors: MultisigErrors, config?: MultisigConfig } {
  const errors: MultisigErrors = {}
  const seen = new Map<string, string>()
  const s = parseList(f.signers, 'Signer', seen)
  const p = parseList(f.proposers, 'Proposer', seen)
  if (s.error) errors.signers = s.error
  else if (!s.list.length) errors.signers = 'Add at least one signer.'
  else if (s.list.length > MAX_SIGNERS) errors.signers = `At most ${MAX_SIGNERS} signers.`
  if (p.error) errors.proposers = p.error
  else if (p.list.length > MAX_SIGNERS) errors.proposers = `At most ${MAX_SIGNERS} proposers.`
  const t = Number(f.threshold.trim())
  if (!f.threshold.trim() || !Number.isInteger(t) || t < 1) errors.threshold = 'Enter how many signers must approve (a whole number, at least 1).'
  else if (!errors.signers && t > s.list.length) errors.threshold = `Cannot be more than the number of signers (${s.list.length}).`
  if (Object.keys(errors).length) return { errors }
  return { errors, config: { threshold: t, signers: s.list, proposers: p.list, allowArbitrarySeqno: true } }
}
