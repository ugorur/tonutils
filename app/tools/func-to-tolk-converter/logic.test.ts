import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as dogs from '~/lib/compilers/examples/dogs-minter'
import { normalizePath } from '~/lib/compilers/files'
import { tolkHandlers } from '~/utils/lazy/tolk.worker'
import a10Fc from './fixtures/a10.fc?raw'
import a10Tolk from './fixtures/a10.fc.tolk?raw'
import addrFc from './fixtures/addr.fc?raw'
import addrTolk from './fixtures/addr.fc.tolk?raw'
import minterFc from './fixtures/jetton-minter.fc?raw'
import minterTolk from './fixtures/jetton-minter.fc.tolk?raw'
import stdfnFc from './fixtures/stdfn.fc?raw'
import stdfnTolk from './fixtures/stdfn.fc.tolk?raw'
import { convertFile, convertProject, DEFAULT_OPTIONS, fixVersionLine, initConverter, tolkFiles, tolkPath } from './logic'

// Expected outputs: github.com/ton-blockchain/convert-func-to-tolk tests/inout at dfd5bc5a (the v1.0.0 release),
// checked there by tests/folder-inout.spec.ts with default options.

beforeAll(async () => {
  // The vendored emscripten loader takes its Node branch here and calls require('fs') once at init.
  Object.assign(globalThis, { require: createRequire(import.meta.url), __dirname: fileURLToPath(new URL('.', import.meta.url)) })
  const wasm = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../lib/compilers/vendor/${name}`, import.meta.url))))
  await initConverter(wasm('tree-sitter.wasm'), wasm('tree-sitter-func.wasm'))
})

describe('official converter test vectors (tests/inout)', () => {
  for (const [name, fc, tolk] of [['a10.fc', a10Fc, a10Tolk], ['addr.fc', addrFc, addrTolk], ['stdfn.fc', stdfnFc, stdfnTolk], ['jetton-minter.fc', minterFc, minterTolk]] as const) {
    it(name, () => {
      const r = convertFile({ path: name, content: fc }, DEFAULT_OPTIONS)
      expect(r.kind).toBe('converted')
      if (r.kind === 'converted') expect(r.content).toBe(tolk)
    })
  }
})

describe('project conversion', () => {
  it('maps paths, skips stdlib.fc and keeps the entrypoint first', () => {
    const out = convertProject(dogs.files, DEFAULT_OPTIONS, '1.5.0')
    expect(out.map(f => `${f.kind}:${f.path}`)).toEqual([
      'converted:contracts/jetton-minter.tolk',
      'converted:contracts/gas.tolk',
      'converted:contracts/jetton-utils.tolk',
      'converted:contracts/op-codes.tolk',
      'stdlib:contracts/stdlib.tolk',
      'converted:contracts/workchain.tolk'
    ])
    expect(tolkFiles(out)).toHaveLength(5)
    expect(tolkPath('./a/b.func')).toBe('a/b.tolk')
  })

  it('rewrites the version line for the compiler in use', () => {
    expect(fixVersionLine('// x\n\ntolk 1.0\n\nimport "a"', '1.5.0')).toBe('// x\n\ntolk 1.5.0\n\nimport "a"')
    expect(fixVersionLine('fun main() {}', '1.5.0')).toBe('fun main() {}')
  })

  it('honours the naming options', () => {
    const src = 'int get_total(int some_value) { int my_local = some_value; return my_local; }'
    const keep = convertFile({ path: 'a.fc', content: src }, { ...DEFAULT_OPTIONS, camelCaseFunctions: false, camelCaseLocals: false })
    expect(keep.kind === 'converted' && keep.content).toContain('fun get_total(some_value: int): int')
    const camel = convertFile({ path: 'a.fc', content: src }, DEFAULT_OPTIONS)
    expect(camel.kind === 'converted' && camel.content).toContain('fun getTotal(someValue: int): int')
  })

  it('reports problems with line numbers and can inline them as comments', () => {
    // `~%` was removed from Tolk (REMOVED_BINARY_OPERATORS in renaming-mapping.js)
    const src = 'int f(int a, int b) {\n  int c = 1;\n  return a ~% b;\n}\n'
    const r = convertFile({ path: 'w.fc', content: src }, { ...DEFAULT_OPTIONS, warningsAsComments: true })
    expect(r.kind).toBe('converted')
    if (r.kind !== 'converted') return
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings[0]).toMatchObject({ line: 3, text: expect.stringContaining('has been removed') })
    expect(r.content).toContain('_WARNING_')
  })
})

describe('compile check with Tolk 1.5', () => {
  it('a simple contract converts to Tolk that compiles and keeps its get method', async () => {
    const src = '#include "imports/stdlib.fc";\n\n() recv_internal(slice in_msg_body) impure {\n  throw_unless(101, in_msg_body.slice_bits() >= 32);\n}\n\nint get_answer() method_id {\n  return 42;\n}\n'
    const files = tolkFiles(convertProject([{ path: 'contracts/main.fc', content: src }, { path: 'contracts/imports/stdlib.fc', content: '' }], DEFAULT_OPTIONS, '1.5.0'))
    expect(files.map(f => f.path)).toEqual(['contracts/main.tolk'])
    expect(files[0]!.content).toContain('assert(inMsgBody.remainingBitsCount() >= 32) throw 101')
    const r = await tolkHandlers.compile(Object.fromEntries(files.map(f => [normalizePath(f.path), f.content])), files[0]!.path)
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
    if (r.status === 'ok') expect((r.abiJson.get_methods as { name: string }[]).map(m => m.name)).toEqual(['get_answer'])
  }, 120_000)

  it('the converter header compiles once fixed, and still-needed manual fixes show as compile errors', async () => {
    const out = convertProject(dogs.files, DEFAULT_OPTIONS, '1.5.0')
    const files = tolkFiles(out)
    const r = await tolkHandlers.compile(Object.fromEntries(files.map(f => [f.path, f.content])), files[0]!.path)
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.message).not.toContain('the contract is written in Tolk v1.0')
      expect(r.message).toMatch(/contracts\/\w[\w-]*\.tolk:\d+/)
    }
  }, 120_000)
})
