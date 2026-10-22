// Minimal promise RPC over postMessage for the WASM workers in this folder.
// Arguments and results must be structured-cloneable (strings, numbers, plain objects, Uint8Array…):
// pass cells as base64 BOC, not Cell instances.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handlers = Record<string, (...args: any[]) => unknown>

interface Request { id: number, method: string, args: unknown[] }
type Response = { id: number, result: unknown } | { id: number, error: string }

/** Worker side. No-op outside a worker, so handler modules can also be imported by tests. */
export function exposeWorker(handlers: Handlers) {
  if (typeof WorkerGlobalScope === 'undefined' || !(globalThis instanceof WorkerGlobalScope)) return
  globalThis.addEventListener('message', async (e: Event) => {
    const { id, method, args } = (e as MessageEvent<Request>).data
    try {
      const fn = handlers[method]
      if (!fn) throw new Error(`Unknown worker method ${method}`)
      postMessage({ id, result: await fn(...args) } satisfies Response)
    }
    catch (err) {
      postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies Response)
    }
  })
}

/** Main-thread side. The worker starts on the first call; terminate() frees its memory (WASM heaps are large). */
export function workerClient<H extends Handlers>(create: () => Worker) {
  let worker: Worker | null = null
  let seq = 0
  const pending = new Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>()

  function start(): Worker {
    if (worker) return worker
    const w = create()
    w.onmessage = (e: MessageEvent<Response>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if ('error' in e.data) p.reject(new Error(e.data.error))
      else p.resolve(e.data.result)
    }
    w.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(`Worker failed: ${e.message || 'could not load'}`))
      pending.clear()
      w.terminate()
      worker = null
    }
    worker = w
    return w
  }

  return {
    call<K extends keyof H & string>(method: K, ...args: Parameters<H[K]>): Promise<Awaited<ReturnType<H[K]>>> {
      const id = ++seq
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        start().postMessage({ id, method, args } satisfies Request)
      })
    },
    terminate() {
      worker?.terminate()
      worker = null
      for (const p of pending.values()) p.reject(new Error('Worker terminated'))
      pending.clear()
    }
  }
}
