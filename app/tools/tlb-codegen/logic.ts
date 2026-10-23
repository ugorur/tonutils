import type { TlbCodegen } from './codegen'

/** The `parse` export of @ton-community/tlb-parser (ohm match result with a line/column message). */
export interface TlbSyntax { parse: (src: string) => { succeeded(): boolean, message?: string } }

export interface Generated {
  code: string
  /** Exported load…/store… functions, in output order. */
  loaders: string[]
  storers: string[]
}

/** TL-B schema → TypeScript (@ton/core) with tlb-codegen. Errors come back with a readable message. */
export function generateTypescript(codegen: TlbCodegen, parser: TlbSyntax, schema: string): Generated {
  if (!schema.trim()) throw new Error('Enter a TL-B schema')
  const syntax = parser.parse(schema)
  if (!syntax.succeeded()) throw new Error(syntax.message ?? 'TL-B syntax error')
  let code: string
  try {
    code = codegen.generateCode(schema, 'typescript')
  }
  catch (e) {
    const msg = (e as Error).message || String(e)
    throw new Error(`The generator cannot handle this schema: ${msg}`)
  }
  const names = (prefix: string) => [...code.matchAll(new RegExp(`export function (${prefix}\\w+)`, 'g'))].map(m => m[1]!)
  return { code, loaders: names('load'), storers: names('store') }
}
