import { getMethodId, type Cell, type TupleItem } from '@ton/core'
import { codeMethods, effectiveCode, libsDict, methodNames, type AccountState, type Tasm } from '~/lib/tvm-wasm/code'
import { describeExitCode, isSuccessExit } from '~/lib/tx-dev/exitCodes'
import { argsToItems, type ArgRow } from '~/tools/tvm-stack-codec/logic'
import type { GetMethodArgs } from '~/utils/lazy'
import { parseBoc } from '~/utils/ton/messages'

export type { ArgRow }

/** A get-method by name (crc16 id) or by numeric id (decimal or 0x hex, as the disassembler shows it). */
export function parseMethod(input: string): { id: number, name: string | null } {
  const s = input.trim()
  if (!s) throw new Error('Enter a get-method name (e.g. seqno) or its numeric id.')
  if (/^-?\d+$/.test(s) || /^0x[0-9a-f]+$/i.test(s)) {
    const id = Number(s)
    if (!Number.isSafeInteger(id) || id < -(2 ** 31) || id >= 2 ** 31) throw new Error(`Method id ${s} does not fit in 32 bits.`)
    return { id, name: methodNames().get(id) ?? null }
  }
  if (!/^[A-Za-z_][\w?!'.]*$/.test(s)) throw new Error(`"${s}" is not a valid method name.`)
  return { id: getMethodId(s), name: s }
}

/** Get-methods present in the code's method dictionary (id + best-known name). Empty for hand-dispatched code. */
export function availableMethods(tasm: Tasm, code: Cell, libs: Cell[]): { id: number, name: string | null }[] {
  try {
    return codeMethods(tasm.runtime.decompileCell(effectiveCode(code, libs)))
      .filter(m => m.kind === 'get')
      .map(({ id, name }) => ({ id, name }))
  }
  catch {
    return [] // ponytail: undecodable code just means no picker; the user can still type a name or id
  }
}

export interface Overrides {
  /** nanoGRAM; default: the account's on-chain balance. */
  balance?: bigint | null
  /** Unix seconds for NOW; default: current time. */
  unixTime?: number | null
  /** Code / data BOC (base64 or hex) replacing the fetched state. Empty = on-chain. */
  code?: string
  data?: string
  gasLimit?: bigint | null
}

export interface RunPlan {
  method: { id: number, name: string | null }
  stack: TupleItem[]
  args: GetMethodArgs
  overridden: string[]
}

/** Everything the emulator needs for one call: on-chain state with optional "what if" overrides. */
export function buildRun(state: Pick<AccountState, 'address' | 'balance' | 'code' | 'data' | 'libs'>, methodInput: string, argRows: ArgRow[], o: Overrides = {}): RunPlan {
  const method = parseMethod(methodInput)
  const stack = argsToItems(argRows)
  const overridden: string[] = []
  const cell = (s: string | undefined, what: string) => {
    if (!s?.trim()) return null
    try {
      return parseBoc(s)
    }
    catch {
      throw new Error(`${what} override is not a valid BOC (base64 or hex).`)
    }
  }
  const code = cell(o.code, 'Code')
  const data = cell(o.data, 'Data')
  if (code && !code.equals(state.code)) overridden.push('code')
  if (data && !data.equals(state.data)) overridden.push('data')
  if (o.balance != null && o.balance !== state.balance) overridden.push('balance')
  if (o.unixTime != null) overridden.push('time')
  if (o.gasLimit != null) overridden.push('gas limit')
  return {
    method,
    stack,
    overridden,
    args: {
      code: code ?? state.code,
      data: data ?? state.data,
      address: state.address,
      method: method.id,
      stack,
      balance: o.balance ?? state.balance,
      libs: libsDict(state.libs),
      unixTime: o.unixTime ?? undefined,
      gasLimit: o.gasLimit ?? undefined
    }
  }
}

export const exitInfo = (code: number) => ({ ok: isSuccessExit(code), text: describeExitCode(code) })

