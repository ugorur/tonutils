// Lazy loaders for heavy browser-only libraries: import { loadX } from '~/utils/lazy'. Call them from Tool.vue / logic.ts only
// (client side); each one downloads its chunk on first use and never enters the server bundle.
// WASM compilers/emulators run in Web Workers so the page stays responsive.
import type { Address, Cell, TupleItem, TupleReader } from '@ton/core'
import type { funcHandlers } from './func.worker'
import { workerClient } from './rpc'
import type { RawGetMethodArgs, RawTransactionArgs, sandboxHandlers } from './sandbox.worker'
import type { TolkCompileOptions, tolkHandlers } from './tolk.worker'

/** @ton/tasm: `runtime.decompileCell(cell)` + `text.print(instrs)` to disassemble; `text.parse` + `runtime.compileCell` to assemble. */
export const loadTasm = () => import('@ton/tasm')

/** @ton-community/tlb-runtime: `parseTLB(schema).deserialize(boc)` decodes any cell by a TL-B schema. */
export const loadTlbRuntime = () => import('@ton-community/tlb-runtime')

/** @ton-community/tlb-parser: `ast(schema)` / `parse(schema)` for TL-B syntax trees. */
export const loadTlbParser = () => import('@ton-community/tlb-parser')

/** jsQR: `jsQR(imageData.data, width, height)` reads a QR code from pixels. */
export const loadJsQr = () => import('jsqr').then(m => m.default)

/** uPlot (+ its CSS): `new uPlot(opts, data, element)`. */
export async function loadUplot() {
  const [m] = await Promise.all([import('uplot'), import('uplot/dist/uPlot.min.css')])
  return m.default
}

// ---------------------------------------------------------------- Tolk (worker, ~9 MB)

const tolk = import.meta.client
  ? workerClient<typeof tolkHandlers>(() => new Worker(new URL('./tolk.worker.ts', import.meta.url), { type: 'module' }))
  : null

/**
 * Tolk compiler in a worker. compile() resolves with tolk-js's result:
 * `{ status: 'ok', codeBoc64, codeHashHex, fiftCode, abiJson, … } | { status: 'error', message }`.
 */
export async function loadTolk() {
  if (!tolk) throw new Error('loadTolk is client-only')
  return {
    version: () => tolk.call('version'),
    compile: (files: Record<string, string>, entry: string, opts?: TolkCompileOptions) => tolk.call('compile', files, entry, opts),
    terminate: () => tolk.terminate()
  }
}

// ---------------------------------------------------------------- FunC (worker, ~9 MB)

const func = import.meta.client
  ? workerClient<typeof funcHandlers>(() => new Worker(new URL('./func.worker.ts', import.meta.url), { type: 'module' }))
  : null

/** FunC compiler (func-js) in a worker. No stdlib bundled: pass stdlib.fc in `sources` if you import it. */
export async function loadFunc() {
  if (!func) throw new Error('loadFunc is client-only')
  return {
    version: () => func.call('version'),
    compile: (sources: Record<string, string>, targets: string[]) => func.call('compile', sources, targets),
    terminate: () => func.terminate()
  }
}

// ---------------------------------------------------------------- TVM emulator (worker, ~7 MB)

const sandbox = import.meta.client
  ? workerClient<typeof sandboxHandlers>(() => new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' }))
  : null

export interface GetMethodArgs {
  code: Cell | string
  data: Cell | string
  address: Address | string
  method: string | number
  stack?: TupleItem[]
  /** nanoGRAM. */
  balance?: bigint
  /** Config BOC (base64); default: @ton/sandbox's bundled mainnet config. */
  config?: string
  libs?: Cell | string
  unixTime?: number
  gasLimit?: bigint
  verbosity?: RawGetMethodArgs['verbosity']
}

export interface GetMethodResult {
  /** TVM exit code; 0 and 1 mean success. */
  exitCode: number
  gasUsed: bigint
  stack: TupleItem[]
  /** Convenience reader over `stack`. */
  reader: TupleReader
  vmLog: string
  /** Emulator logs and debug prints (~dump / debug.print). */
  logs: string
  debugLogs: string
  /** Hash of a library cell the code needed but was not given. */
  missingLibrary: string | null
}

/** @ton/sandbox Executor in a worker: run get-methods and transactions on any code/data, offline. */
export async function loadSandbox() {
  if (!sandbox) throw new Error('loadSandbox is client-only')
  const { Address, Cell, TupleReader, parseTuple, serializeTuple } = await import('@ton/core')
  const b64 = (c: Cell | string) => (typeof c === 'string' ? c : c.toBoc().toString('base64'))
  return {
    version: () => sandbox.call('version'),
    async runGetMethod(a: GetMethodArgs): Promise<GetMethodResult> {
      const res = await sandbox.call('runGetMethod', {
        code: b64(a.code),
        data: b64(a.data),
        address: typeof a.address === 'string' ? Address.parse(a.address).toRawString() : a.address.toRawString(),
        method: a.method,
        stack: a.stack?.length ? serializeTuple(a.stack).toBoc().toString('base64') : undefined,
        balance: (a.balance ?? 0n).toString(),
        config: a.config,
        libs: a.libs ? b64(a.libs) : undefined,
        unixTime: a.unixTime,
        gasLimit: a.gasLimit?.toString(),
        verbosity: a.verbosity
      })
      if (!res.output.success) throw new Error(`Emulator error: ${res.output.error}`)
      const stack = parseTuple(Cell.fromBase64(res.output.stack))
      return {
        exitCode: res.output.vm_exit_code,
        gasUsed: BigInt(res.output.gas_used),
        stack,
        reader: new TupleReader(stack),
        vmLog: res.output.vm_log,
        logs: res.logs,
        debugLogs: res.debugLogs,
        missingLibrary: res.output.missing_library
      }
    },
    /** Raw Executor.runTransaction (base64 in/out). See @ton/sandbox EmulationResult. */
    runTransaction: (a: RawTransactionArgs) => sandbox.call('runTransaction', a),
    terminate: () => sandbox.terminate()
  }
}
