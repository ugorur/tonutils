import './worker-env'
import { compileFunc, compilerVersion } from '@ton-community/func-js'
import { exposeWorker } from './rpc'

export const funcHandlers = {
  version: () => compilerVersion(),
  /** sources: path -> source (no stdlib bundled: include stdlib.fc yourself). targets: entry files in order. */
  compile: (sources: Record<string, string>, targets: string[]) => compileFunc({ sources, targets })
}

exposeWorker(funcHandlers)
