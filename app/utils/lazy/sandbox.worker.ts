import './worker-env'
import { Address, Cell, getMethodId, parseTuple } from '@ton/core'
import { defaultConfig } from '@ton/sandbox/dist/config/defaultConfig'
import { Executor } from '@ton/sandbox/dist/executor/Executor'
import type { ExecutorVerbosity } from '@ton/sandbox/dist/executor/Executor'
import { exposeWorker } from './rpc'

// The TVM emulator (@ton/sandbox Executor, ~7 MB WASM) in a worker. Cells travel as base64 BOC.
let executor: Promise<Executor> | null = null
const getExecutor = () => (executor ??= Executor.create())

export interface RawGetMethodArgs {
  code: string
  data: string
  /** Account address (affects MYADDR). */
  address: string
  method: string | number
  /** Serialized tuple (serializeTuple(items).toBoc() base64), default empty. */
  stack?: string
  /** nanoGRAM, decimal string. */
  balance?: string
  /** Blockchain config BOC base64; default: sandbox's bundled mainnet config. */
  config?: string
  /** Library cells dictionary BOC base64. */
  libs?: string
  unixTime?: number
  gasLimit?: string
  verbosity?: ExecutorVerbosity
}

export interface RawTransactionArgs {
  /** ShardAccount BOC base64. */
  shardAccount: string
  /** Incoming message BOC base64. */
  message: string
  now: number
  lt: string
  config?: string
  libs?: string
  ignoreChksig?: boolean
  verbosity?: ExecutorVerbosity
}

export const sandboxHandlers = {
  version: async () => (await getExecutor()).getVersion(),
  runGetMethod: async (a: RawGetMethodArgs) => {
    const ex = await getExecutor()
    return ex.runGetMethod({
      code: Cell.fromBase64(a.code),
      data: Cell.fromBase64(a.data),
      methodId: typeof a.method === 'number' ? a.method : getMethodId(a.method),
      stack: a.stack ? parseTuple(Cell.fromBase64(a.stack)) : [],
      config: a.config ?? defaultConfig,
      libs: a.libs ? Cell.fromBase64(a.libs) : undefined,
      verbosity: a.verbosity ?? 'full_location',
      address: Address.parse(a.address),
      unixTime: a.unixTime ?? Math.floor(Date.now() / 1000),
      balance: BigInt(a.balance ?? '0'),
      randomSeed: Buffer.alloc(32),
      gasLimit: BigInt(a.gasLimit ?? '10000000'),
      debugEnabled: true
    })
  },
  runTransaction: async (a: RawTransactionArgs) => {
    const ex = await getExecutor()
    return ex.runTransaction({
      shardAccount: a.shardAccount,
      message: Cell.fromBase64(a.message),
      now: a.now,
      lt: BigInt(a.lt),
      config: a.config ?? defaultConfig,
      libs: a.libs ? Cell.fromBase64(a.libs) : null,
      verbosity: a.verbosity ?? 'full_location',
      randomSeed: null,
      ignoreChksig: a.ignoreChksig ?? false,
      debugEnabled: true
    })
  }
}

exposeWorker(sandboxHandlers)
