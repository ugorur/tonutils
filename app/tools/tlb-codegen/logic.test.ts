import * as tlbParser from '@ton-community/tlb-parser'
import { blockSchema } from '@ton-community/tlb-runtime'
import * as core from '@ton/core'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'
import { TLB_PRESETS } from '~/lib/tlb/presets'
import type { TlbCodegen } from './codegen'
import { loadTlbCodegen } from './codegen'
import type { TlbSyntax } from './logic'
import { generateTypescript } from './logic'

let cg: TlbCodegen
const parser = tlbParser as unknown as TlbSyntax
beforeAll(async () => {
  cg = await loadTlbCodegen()
})

/** Compiles the generated TypeScript and runs it against the real @ton/core. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(code: string): any {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} as Record<string, never> }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', js)((s: string) => {
    if (s !== '@ton/core') throw new Error(s)
    return core
  }, mod, mod.exports)
  return mod.exports
}
const preset = (id: string) => TLB_PRESETS.find(p => p.id === id)!

describe('generateTypescript', () => {
  it('generates loaders and storers for the README example', () => {
    const g = generateTypescript(cg, parser, '_ x:# = Foo;')
    expect(g.loaders).toContain('loadFoo')
    expect(g.storers).toContain('storeFoo')
    expect(g.code).toContain('let x: number = slice.loadUint(32);')
    // tlb-runtime README vector: Foo x=42
    expect(run(g.code).loadFoo(core.Cell.fromBase64('te6cckEBAQEABgAACAAAACoFpvBE').beginParse())).toEqual({ kind: 'Foo', x: 42 })
  })

  it('the TEP-74 code decodes a real mainnet jetton transfer like toncenter does, and re-encodes it bit-exactly', () => {
    const m = run(generateTypescript(cg, parser, preset('tep74').schema!).code)
    const cell = core.Cell.fromBase64(preset('tep74').example!.boc)
    const v = m.loadInternalMsgBody(cell.beginParse())
    // toncenter /api/v3/decode of the same body
    expect(v.kind).toBe('InternalMsgBody_transfer')
    expect(v.query_id).toBe(3n)
    expect(v.amount).toBe(1114695n)
    expect(v.forward_ton_amount).toBe(1n)
    expect(v.destination.toRawString()).toBe('0:202290fa f9c85079c356b6d24b6349d0a951793668c09cfd95a4d563834d6ee9'.replace(' ', ''))
    const b = core.beginCell()
    m.storeInternalMsgBody(v)(b)
    expect(b.endCell().equals(cell)).toBe(true)
  })

  it('every preset offered for codegen generates', () => {
    for (const p of TLB_PRESETS.filter(p => p.schema && p.codegen !== false))
      expect(generateTypescript(cg, parser, p.schema!).loaders.length).toBeGreaterThan(3)
  })

  it('handles the full block.tlb and decodes a real StateInit', () => {
    const g = generateTypescript(cg, parser, blockSchema)
    expect(g.loaders).toContain('loadStateInit')
    const cell = core.Cell.fromBase64(preset('block').example!.boc)
    const v = run(g.code).loadStateInit(cell.beginParse())
    expect(v.kind).toBe('StateInit')
    // hash of this StateInit is the deployed account 0:B41BEF5A…CE42 (toncenter v3 /messages init_state.hash)
    expect(cell.hash().toString('hex').toUpperCase()).toBe('B41BEF5AFF9529E8A47EBDBA03492BAEBED13FF18C9EC6415711252444BECE42')
    expect(v.code.kind).toBe('Maybe_just')
  })

  it('reports errors', () => {
    expect(() => generateTypescript(cg, parser, ' ')).toThrow(/Enter/)
    expect(() => generateTypescript(cg, parser, 'foo x:uint8 = ;')).toThrow(/Line 1/)
  })
})
