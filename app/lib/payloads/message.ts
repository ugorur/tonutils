// Building blocks shared by the internal message builder and the W5 actions builder. Pure TS (needs Buffer).
import type { Address, Cell, MessageRelaxed, StateInit } from '@ton/core'
import { beginCell, contractAddress, internal, loadStateInit, storeMessageRelaxed, storeStateInit } from '@ton/core'
import { commentBody, parseBoc } from '~/utils/ton/messages'

export type BodyKind = 'none' | 'comment' | 'boc'

/** Body from the UI choice. Throws a readable Error for a bad BOC. */
export function buildBody(kind: BodyKind, text: string): Cell | null {
  if (kind === 'comment') return text ? commentBody(text) : null
  if (kind === 'boc') return text.trim() ? parseBoc(text) : null
  return null
}

/** A StateInit BOC (split_depth/special/code/data/library), or code + data BOCs. */
export function buildStateInit(p: { stateInitBoc?: string, codeBoc?: string, dataBoc?: string }): StateInit | null {
  if (p.stateInitBoc?.trim()) {
    try {
      const s = parseBoc(p.stateInitBoc).beginParse()
      const init = loadStateInit(s)
      if (s.remainingBits || s.remainingRefs) throw new Error('unexpected data after the StateInit fields')
      return init
    }
    catch (e) {
      throw new Error(`Not a StateInit cell: ${(e as Error).message}`)
    }
  }
  const code = p.codeBoc?.trim() ? parseBoc(p.codeBoc) : null
  const data = p.dataBoc?.trim() ? parseBoc(p.dataBoc) : null
  return code || data ? { code, data } : null
}

export const stateInitCell = (init: StateInit): Cell => beginCell().store(storeStateInit(init)).endCell()

export interface MessageSpec {
  to: Address
  bounce: boolean
  /** nanoGRAM */
  value: bigint
  body: Cell | null
  init: StateInit | null
}

/** Same defaults wallets use (@ton/core internal()): ihr_disabled, no src, zero lt/time/fees. */
export function messageRelaxed(m: MessageSpec): MessageRelaxed {
  return internal({ to: m.to, value: m.value, bounce: m.bounce, body: m.body ?? undefined, init: m.init ?? undefined })
}

export const messageRelaxedCell = (m: MessageSpec): Cell => beginCell().store(storeMessageRelaxed(messageRelaxed(m))).endCell()

/** Address a StateInit deploys to in the destination's workchain, and whether it matches. */
export function initAddressCheck(m: Pick<MessageSpec, 'to' | 'init'>) {
  if (!m.init) return null
  const computed = contractAddress(m.to.workChain, m.init)
  return { computed, matches: computed.equals(m.to) }
}

export const b64 = (c: Cell) => c.toBoc().toString('base64')
