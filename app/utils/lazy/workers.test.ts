import { Address, beginCell, Cell, TupleReader, parseTuple } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { funcHandlers } from './func.worker'
import { sandboxHandlers } from './sandbox.worker'
import { tolkHandlers } from './tolk.worker'

// The worker handler modules run unchanged in Node, so this checks the same code the browser workers run.
// The browser path itself is covered by the dev page /__dev/loaders (see AGENTS.md).

const ADDR = Address.parse('0:' + '11'.repeat(32)).toRawString()

async function runGet(codeB64: string, method: string) {
  const res = await sandboxHandlers.runGetMethod({ code: codeB64, data: beginCell().endCell().toBoc().toString('base64'), address: ADDR, method })
  if (!res.output.success) throw new Error(res.output.error)
  return { exit: res.output.vm_exit_code, reader: new TupleReader(parseTuple(Cell.fromBase64(res.output.stack))) }
}

describe('WASM workers (node)', () => {
  it('Tolk compiles hello world and the code returns 42 in the sandbox', async () => {
    const src = 'fun onInternalMessage(in: InMessage) {}\n\nget fun hello(): int { return 42; }\n'
    const r = await tolkHandlers.compile({ 'main.tolk': src }, 'main.tolk')
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
    if (r.status !== 'ok') return
    const { exit, reader } = await runGet(r.codeBoc64, 'hello')
    expect(exit).toBe(0)
    expect(reader.readNumber()).toBe(42)
  }, 120_000)

  it('FunC compiles hello world and the code returns 42 in the sandbox', async () => {
    const src = '() recv_internal() impure { }\nint hello() method_id { return 42; }\n'
    const r = await funcHandlers.compile({ 'main.fc': src }, ['main.fc'])
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
    if (r.status !== 'ok') return
    const { exit, reader } = await runGet(r.codeBoc, 'hello')
    expect(exit).toBe(0)
    expect(reader.readNumber()).toBe(42)
  }, 120_000)
})
