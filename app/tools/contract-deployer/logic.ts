// Generic deploy: any code + data (or a ready StateInit / deploy message), sent from the connected wallet.
// StateInit building and decoding are the stateinit-builder tool's (same TL-B, same address rules).
import type { Cell } from '@ton/core'
import { Address } from '@ton/core'
import { parseCell } from '~/lib/boc-advanced/cells'
import { buildStateInit, decodeStateInit, type StateInitInfo } from '~/tools/stateinit-builder/logic'
import { commentBody } from '~/utils/ton/messages'

export type { StateInitInfo }

export interface DeployInput {
  mode: 'code-data' | 'stateinit'
  code: string
  data: string
  stateInit: string
  workchain: 0 | -1
}

export function resolveStateInit(i: DeployInput): StateInitInfo {
  if (i.mode === 'stateinit') {
    const info = decodeStateInit(i.stateInit, i.workchain)
    if (!info.code) throw new Error('This StateInit has no code, so it cannot deploy a contract.')
    return info
  }
  return buildStateInit({ code: i.code, data: i.data, workchain: i.workchain })
}

export type BodyKind = 'none' | 'comment' | 'boc'

export function deployBody(kind: BodyKind, value: string): Cell | undefined {
  if (kind === 'comment') return value ? commentBody(value) : undefined
  if (kind === 'boc') return parseCell(value, 'Message body')
  return undefined
}

export interface DeployMessage { address: string, amount: bigint, stateInit: string, payload?: Cell }

/** Bounceable, so a deploy whose first transaction fails returns the GRAM (the account is created from the StateInit first). */
export function deployMessage(info: StateInitInfo, amount: bigint, body: Cell | undefined, testnet: boolean): DeployMessage {
  const address = Address.parse(info.address.raw).toString({ bounceable: true, testOnly: testnet })
  return { address, amount, stateInit: info.boc, ...(body ? { payload: body } : {}) }
}

/** Blueprint / func-js / tolk-js outputs: {"hex": …}, {"codeBoc64": …} or {"codeBoc": …}; anything else is passed through. */
export function codeFromFile(text: string): string {
  const t = text.trim()
  if (!t.startsWith('{')) return t
  try {
    const j = JSON.parse(t) as Record<string, unknown>
    for (const k of ['hex', 'codeBoc64', 'codeBoc', 'boc']) if (typeof j[k] === 'string') return j[k] as string
  }
  catch { /* not JSON */ }
  return t
}

/** A dropped file: a binary .boc (magic b5ee9c72) becomes base64; text files go through codeFromFile. */
export function fileToBoc(bytes: Uint8Array, text?: string): string {
  if (bytes[0] === 0xb5 && bytes[1] === 0xee && bytes[2] === 0x9c && bytes[3] === 0x72) return Buffer.from(bytes).toString('base64')
  return codeFromFile(text ?? new TextDecoder().decode(bytes))
}
