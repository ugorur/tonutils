// Loads @ton-community/tlb-codegen in the browser, on first use (CommonJS, pre-bundled through vite.optimizeDeps).

export interface TlbCodegen {
  /** TL-B schema → TypeScript source using @ton/core (throws on schemas it cannot handle). */
  generateCode(input: string, language: 'typescript'): string
}

let loading: Promise<TlbCodegen> | null = null

export function loadTlbCodegen(): Promise<TlbCodegen> {
  loading ??= import('@ton-community/tlb-codegen')
    .then(m => ('generateCode' in m ? m : (m as { default: TlbCodegen }).default) as TlbCodegen)
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}
