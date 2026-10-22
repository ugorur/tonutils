import './worker-env'
import { getTolkCompilerVersion, runTolkCompiler } from '@ton/tolk-js'
import { exposeWorker } from './rpc'

export interface TolkCompileOptions {
  withStackComments?: boolean
  withSrcLineComments?: boolean
}

export const tolkHandlers = {
  version: () => getTolkCompilerVersion(),
  /** files: path -> source. Imports resolve against these paths; @stdlib/* is bundled. */
  compile: (files: Record<string, string>, entry: string, opts: TolkCompileOptions = {}) =>
    runTolkCompiler({
      entrypointFileName: entry,
      fsReadCallback: (path) => {
        const src = files[path] ?? files[path.replace(/^\.?\//, '')]
        if (src === undefined) throw new Error(`File not found: ${path}`)
        return src
      },
      ...opts
    })
}

exposeWorker(tolkHandlers)
